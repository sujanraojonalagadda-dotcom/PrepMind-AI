/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Search, 
  BookOpen, 
  PenTool, 
  GraduationCap, 
  MessageSquare, 
  BarChart3, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ArrowRight,
  RefreshCw,
  Info,
  BrainCircuit,
  Zap,
  Target,
  Layers,
  RotateCcw,
  Plus,
  WifiOff,
  CloudUpload,
  UserCircle,
  Camera,
  Check,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  Timestamp,
  addDoc,
  updateDoc,
  serverTimestamp,
  query,
  collection,
  where,
  handleFirestoreError,
  OperationType,
  updateProfile
} from './firebase';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const OfflineManager = {
  save: (key: string, data: any) => {
    try {
      localStorage.setItem(`prepmind_${key}`, JSON.stringify(data));
    } catch (e) {
      console.error("Failed to save to localStorage", e);
    }
  },
  load: (key: string) => {
    try {
      const data = localStorage.getItem(`prepmind_${key}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error("Failed to load from localStorage", e);
      return null;
    }
  },
  addPendingSync: (action: any) => {
    const pending = OfflineManager.load('pending_sync') || [];
    pending.push({ ...action, timestamp: Date.now() });
    OfflineManager.save('pending_sync', pending);
  },
  getPendingSync: () => OfflineManager.load('pending_sync') || [],
  clearPendingSync: () => OfflineManager.save('pending_sync', []),
};

const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

// --- Types ---
type AppState = 'landing' | 'loading' | 'dashboard' | 'login';
type Tab = 'overview' | 'practice' | 'teach' | 'doubt' | 'progress' | 'flashcards' | 'history' | 'profile';

interface ExamOverview {
  pattern: string;
  difficulty: string;
  strategy: string;
  timePlan: string;
  topics: string[];
}

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  trick: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface Flashcard {
  id?: string;
  front: string;
  back: string;
  topic: string;
  mastery?: number;
  lastReviewed?: any;
}

// --- Gemini Service ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const fetchExamOverview = async (examName: string): Promise<ExamOverview> => {
  const cacheKey = `overview_${examName.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = OfflineManager.load(cacheKey);
  if (cached && !navigator.onLine) return cached;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide a detailed overview for the exam: ${examName}. 
    Include:
    1. Exam Pattern (sections, marks, duration)
    2. Difficulty Level (with reasoning)
    3. Preparation Strategy
    4. 30-day Time Plan
    5. List of core syllabus topics (as a simple array of strings)
    
    Format the response as JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          pattern: { type: Type.STRING },
          difficulty: { type: Type.STRING },
          strategy: { type: Type.STRING },
          timePlan: { type: Type.STRING },
          topics: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["pattern", "difficulty", "strategy", "timePlan", "topics"],
      },
    },
  });
  const data = JSON.parse(response.text);
  OfflineManager.save(cacheKey, data);
  return data;
};

const fetchQuestions = async (examName: string, topic: string, difficulty: string): Promise<Question[]> => {
  const cacheKey = `questions_${examName.toLowerCase().replace(/\s+/g, '_')}_${topic.toLowerCase().replace(/\s+/g, '_')}_${difficulty.toLowerCase()}`;
  const cached = OfflineManager.load(cacheKey);
  if (cached && !navigator.onLine) return cached;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate 3 high-quality multiple-choice questions for the exam "${examName}" on the topic "${topic}" with "${difficulty}" difficulty.
    Each question should have 4 options, a correct index (0-3), a detailed AI explanation, and a shortcut trick.
    Format as JSON array.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING },
            trick: { type: Type.STRING },
          },
          required: ["question", "options", "correctIndex", "explanation", "trick"],
        },
      },
    },
  });
  const data = JSON.parse(response.text);
  OfflineManager.save(cacheKey, data);
  return data;
};

const fetchFlashcards = async (examName: string, topic: string): Promise<Flashcard[]> => {
  const cacheKey = `flashcards_${examName.toLowerCase().replace(/\s+/g, '_')}_${topic.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = OfflineManager.load(cacheKey);
  if (cached && !navigator.onLine) return cached;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate 5 high-quality study flashcards for the exam "${examName}" on the topic "${topic}".
    Each flashcard should have a "front" (key term or question) and a "back" (detailed definition or answer).
    Format as JSON array of objects with "front", "back", and "topic" fields.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.STRING },
            back: { type: Type.STRING },
            topic: { type: Type.STRING },
          },
          required: ["front", "back", "topic"],
        },
      },
    },
  });
  const data = JSON.parse(response.text);
  OfflineManager.save(cacheKey, data);
  return data;
};

const fetchPersonalizedPlan = async (examName: string, performanceData: any): Promise<string> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the user's performance in the "${examName}" exam, generate a personalized 30-day study plan.
    User Performance Data: ${JSON.stringify(performanceData)}
    The plan should:
    - Prioritize topics where the user is struggling (low scores or low accuracy).
    - Suggest specific daily study goals for the next 7 days.
    - Provide strategic advice for the remaining 23 days.
    - Use Markdown formatting with clear headings and bullet points.
    - Be encouraging and actionable.`,
  });
  return response.text;
};

const fetchDailyGoals = async (examName: string, performanceData: any): Promise<string[]> => {
  const cacheKey = `dailyGoals_${examName.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = OfflineManager.load(cacheKey);
  if (cached && !navigator.onLine) return cached;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the user's performance in the "${examName}" exam, suggest 3 specific daily study goals for today.
    User Performance Data: ${JSON.stringify(performanceData)}
    Format as JSON array of strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });
  const data = JSON.parse(response.text);
  OfflineManager.save(cacheKey, data);
  return data;
};

const fetchPerformanceSummary = async (examName: string, performanceData: any): Promise<string> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the user's performance in the "${examName}" exam, provide a concise summary of their overall performance.
    User Performance Data: ${JSON.stringify(performanceData)}
    The summary should:
    - Highlight 2-3 key strengths (topics with high accuracy or improvement).
    - Identify 2-3 specific areas for improvement (topics with low accuracy or declining trends).
    - Provide 1-2 actionable tips for the next study session.
    - Use Markdown formatting with clear sections.
    - Be encouraging and professional.
    - Keep it under 200 words.`,
  });
  return response.text;
};

const fetchTopicContent = async (examName: string, topic: string): Promise<string> => {
  const cacheKey = `topic_${examName.toLowerCase().replace(/\s+/g, '_')}_${topic.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = OfflineManager.load(cacheKey);
  if (cached && !navigator.onLine) return cached;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Teach me the topic "${topic}" for the exam "${examName}". 
    Include:
    - Core concepts
    - Important formulas
    - Shortcut tricks
    - 2 solved examples
    - **Recommended Textbooks:** List 2-3 specific, high-quality textbooks for this topic.
    Use Markdown formatting.`,
  });
  const text = response.text;
  OfflineManager.save(cacheKey, text);
  return text;
};

// --- Components ---

const LoginPage = ({ onLogin, onBack }: { onLogin: () => void, onBack: () => void }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#06060a] text-white font-['Instrument_Sans'] relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-[#e8ff5a]/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-[#b8cc48]/10 rounded-full blur-[120px] animate-pulse [animation-delay:1s]" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-[#0d0d14] border border-white/5 rounded-[32px] p-10 space-y-8 relative z-10 shadow-2xl shadow-black/50"
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-[#e8ff5a] rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-[#e8ff5a]/20">
            <BrainCircuit className="w-10 h-10 text-black" />
          </div>
          <h2 className="text-3xl font-bold font-['Clash_Display'] tracking-tight">
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            {isSignUp 
              ? 'Join PrepMind AI to start your personalized exam journey.' 
              : 'Sign in to sync your progress across devices and unlock AI insights.'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
            <input 
              type="email" 
              placeholder="name@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-[#e8ff5a] transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest ml-1">Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-[#e8ff5a] transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            className="w-full bg-[#e8ff5a] text-black py-4 rounded-2xl font-bold hover:bg-[#d4e84d] transition-all active:scale-[0.98] mt-2 shadow-lg shadow-[#e8ff5a]/10"
          >
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0d0d14] px-4 text-gray-500 font-bold tracking-widest">Or continue with</span></div>
          </div>

          <button 
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white py-4 rounded-2xl font-bold hover:bg-white/10 transition-all active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Google
          </button>
        </div>

        <div className="text-center space-y-4">
          <p className="text-sm text-gray-500">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-[#e8ff5a] font-bold hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
          
          <button 
            onClick={onBack}
            className="text-xs text-gray-600 hover:text-gray-400 transition-all font-medium uppercase tracking-widest"
          >
            Back to Home
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Landing = ({ onStart, user, onLoginClick }: { onStart: (name: string) => void, user: User | null, onLoginClick: () => void }) => {
  const [input, setInput] = useState('');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#06060a] text-white font-['Instrument_Sans']">
      <div className="absolute top-8 right-8">
        {user ? (
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
            <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full" />
            <span className="text-sm font-medium">{user.displayName}</span>
            <button onClick={() => signOut(auth)} className="text-xs text-gray-500 hover:text-white transition-colors">Sign Out</button>
          </div>
        ) : (
          <button 
            onClick={onLoginClick}
            className="flex items-center gap-2 bg-white/5 border border-white/10 px-6 py-2 rounded-2xl hover:bg-white/10 transition-all font-medium"
          >
            Sign In
          </button>
        )}
      </div>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full text-center space-y-8"
      >
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#e8ff5a]/10 border border-[#e8ff5a]/20 text-[#e8ff5a] text-sm font-medium"
          >
            <BrainCircuit className="w-4 h-4" />
            AI-Powered Exam Prep
          </motion.div>
          <h1 className="text-6xl md:text-7xl font-bold tracking-tighter font-['Clash_Display']">
            PrepMind <span className="text-[#e8ff5a]">AI</span>
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-lg mx-auto">
            Master any exam with personalized AI strategies, practice sets, and instant doubt resolution.
          </p>
        </div>

        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-[#e8ff5a] to-[#b8cc48] rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
          <div className="relative flex items-center bg-[#0d0d14] border border-white/10 rounded-2xl p-2">
            <Search className="w-6 h-6 ml-4 text-gray-500" />
            <input 
              type="text" 
              placeholder="Enter exam name (e.g., CAT, GATE, TCS NQT...)" 
              className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-4 text-lg outline-none"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && input && onStart(input)}
            />
            <button 
              onClick={() => input && onStart(input)}
              className="bg-[#e8ff5a] text-black px-6 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-[#d4e84d] transition-colors"
            >
              Start Prep <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 text-sm text-gray-500">
          <span>Popular:</span>
          {['CAT', 'GATE', 'TCS NQT', 'SBI PO', 'UPSC'].map(exam => (
            <button 
              key={exam}
              onClick={() => onStart(exam)}
              className="hover:text-[#e8ff5a] transition-colors"
            >
              {exam}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

const LoadingScreen = ({ examName }: { examName: string }) => {
  const steps = [
    "Analyzing exam syllabus...",
    "Fetching latest patterns...",
    "Generating study strategy...",
    "Preparing practice modules...",
    "Initializing AI tutor..."
  ];
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#06060a] text-white">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="relative w-24 h-24 mx-auto">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border-4 border-[#e8ff5a]/20 border-t-[#e8ff5a] rounded-full"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <BrainCircuit className="w-10 h-10 text-[#e8ff5a]" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold font-['Clash_Display']">Prepping for {examName}</h2>
          <div className="h-6 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p 
                key={currentStep}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="text-[#e8ff5a] font-medium"
              >
                {steps[currentStep]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex gap-1 justify-center">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={cn(
                "h-1 w-8 rounded-full transition-colors duration-500",
                i <= currentStep ? "bg-[#e8ff5a]" : "bg-white/10"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ examName, overview, user }: { examName: string, overview: ExamOverview, user: User | null }) => {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  
  // Practice State
  const [practiceTopic, setPracticeTopic] = useState(overview.topics[0]);
  const [topicDifficulties, setTopicDifficulties] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    overview.topics.forEach(t => initial[t] = 'Medium');
    return initial;
  });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [topicScores, setTopicScores] = useState<Record<string, { correct: number, total: number }>>({});
  const [masteryHistory, setMasteryHistory] = useState<Record<string, { timestamp: number, mastery: number }[]>>({});
  const [chartTopic, setChartTopic] = useState<string>('All');

  const getChartData = (topics?: string[]) => {
    const topicsToShow = topics || (chartTopic === 'All' ? overview.topics : [chartTopic]);
    
    const allTimestamps = new Set<number>();
    topicsToShow.forEach(topic => {
      (masteryHistory[topic] || []).forEach(point => allTimestamps.add(point.timestamp));
    });

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    return sortedTimestamps.map(ts => {
      const dataPoint: any = { 
        timestamp: ts, 
        time: new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      };
      topicsToShow.forEach(topic => {
        const history = masteryHistory[topic] || [];
        const lastPoint = history.filter(p => p.timestamp <= ts).pop();
        if (lastPoint) {
          dataPoint[topic] = lastPoint.mastery;
        }
      });
      return dataPoint;
    });
  };

  const CHART_COLORS = ['#e8ff5a', '#5afff3', '#ff5ae8', '#ff9e5a', '#5a7fff', '#a3ff5a', '#ff5a5a', '#bc5aff'];

  // Timer State
  const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes in seconds
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);

  // AI Assistant Teacher State
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<ChatMessage[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [loadingAssistant, setLoadingAssistant] = useState(false);
  const assistantEndRef = useRef<HTMLDivElement>(null);

  // Flashcards State
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loadingFlashcards, setLoadingFlashcards] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flashcardTopic, setFlashcardTopic] = useState(overview.topics[0]);

  // Personalized Plan State
  const [personalizedPlan, setPersonalizedPlan] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Daily Goals State
  const [dailyGoals, setDailyGoals] = useState<string[]>([]);
  const [loadingGoals, setLoadingGoals] = useState(false);

  // History State
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Performance Summary State
  const [performanceSummary, setPerformanceSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Video State
  const [videoUrl, setVideoUrl] = useState<Record<string, string>>({});
  const [loadingVideo, setLoadingVideo] = useState<Record<string, boolean>>({});

  const handleGenerateVideo = async (topic: string) => {
    if (loadingVideo[topic]) return;
    
    const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
    if (!hasKey) {
      await (window as any).aistudio?.openSelectKey();
    }

    setLoadingVideo(prev => ({ ...prev, [topic]: true }));
    try {
      const response = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: `A clear, educational animation explaining the core concepts of "${topic}" for the ${examName} exam. Use diagrams and text overlays.`,
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      let operation = response;
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoResponse = await fetch(downloadLink, {
          method: 'GET',
          headers: {
            'x-goog-api-key': (process.env as any).API_KEY || '',
          },
        });
        const blob = await videoResponse.blob();
        const url = URL.createObjectURL(blob);
        setVideoUrl(prev => ({ ...prev, [topic]: url }));
      }
    } catch (err) {
      console.error("Error generating video:", err);
      alert("Failed to generate video. Please try again later.");
    } finally {
      setLoadingVideo(prev => ({ ...prev, [topic]: false }));
    }
  };

  const getDailyGrowthData = () => {
    const dailyData: Record<string, { total: number, correct: number }> = {};
    
    Object.values(masteryHistory).flat().forEach(point => {
      const date = new Date(point.timestamp).toLocaleDateString();
      if (!dailyData[date]) {
        dailyData[date] = { total: 0, correct: 0 };
      }
      dailyData[date].total += 1;
      // Mastery is a percentage, let's assume it represents growth
      dailyData[date].correct += point.mastery;
    });

    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      growth: Math.round(data.correct / data.total)
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Profile State
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please ensure you have granted permission.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const handleUpdateProfilePic = async () => {
    if (!user || !capturedImage) return;
    setUpdatingProfile(true);
    try {
      await updateProfile(user, { photoURL: capturedImage });
      alert("Profile picture updated successfully!");
      setCapturedImage(null);
    } catch (err) {
      console.error("Error updating profile picture:", err);
      alert("Failed to update profile picture.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  useEffect(() => {
    if (isOnline && user) {
      const sync = async () => {
        const pending = OfflineManager.getPendingSync();
        if (pending.length === 0) return;

        console.log(`Syncing ${pending.length} pending actions...`);
        for (const action of pending) {
          try {
            if (action.type === 'SAVE_PROGRESS') {
              const progressRef = doc(db, 'users', user.uid, 'progress', action.examName);
              await setDoc(progressRef, action.data);
            } else if (action.type === 'UPDATE_FLASHCARD') {
              await updateDoc(doc(db, `users/${user.uid}/flashcards`, action.cardId), action.data);
            } else if (action.type === 'ADD_FLASHCARD') {
              await addDoc(collection(db, `users/${user.uid}/flashcards`), action.data);
            }
          } catch (err) {
            console.error("Sync failed for action:", action, err);
          }
        }
        OfflineManager.clearPendingSync();
        alert("Offline changes synced successfully!");
      };
      sync();
    }
  }, [isOnline, user]);

  useEffect(() => {
    if (activeTab === 'progress' && score.total > 0 && !performanceSummary) {
      handleGenerateSummary();
    }
  }, [activeTab, score.total]);

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    try {
      const summary = await fetchPerformanceSummary(examName, {
        score,
        topicScores,
        masteryHistory
      });
      setPerformanceSummary(summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history' && user) {
      setLoadingHistory(true);
      const q = query(collection(db, `users/${user.uid}/progress`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const h = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setHistory(h);
        setLoadingHistory(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/progress`);
        setLoadingHistory(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab, user]);

  const handleRefreshGoals = async () => {
    setLoadingGoals(true);
    try {
      const performanceData = {
        overallScore: score,
        topicScores: topicScores,
        masteryHistory: masteryHistory
      };
      const goals = await fetchDailyGoals(examName, performanceData);
      setDailyGoals(goals);
      localStorage.setItem(`dailyGoals_${examName}`, JSON.stringify(goals));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGoals(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(`dailyGoals_${examName}`);
    if (saved) {
      setDailyGoals(JSON.parse(saved));
    } else {
      handleRefreshGoals();
    }
  }, [examName]);

  useEffect(() => {
    const loadPlan = async () => {
      if (user) {
        try {
          const docRef = doc(db, `users/${user.uid}/progress/${examName}`);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().personalizedPlan) {
            setPersonalizedPlan(docSnap.data().personalizedPlan);
          }
        } catch (error) {
          console.error("Error loading plan:", error);
        }
      } else {
        const saved = localStorage.getItem(`personalizedPlan_${examName}`);
        if (saved) setPersonalizedPlan(saved);
      }
    };
    loadPlan();
  }, [user, examName]);

  const handleGeneratePlan = async () => {
    setLoadingPlan(true);
    try {
      const performanceData = {
        overallScore: score,
        topicScores: topicScores,
        masteryHistory: masteryHistory
      };
      const plan = await fetchPersonalizedPlan(examName, performanceData);
      setPersonalizedPlan(plan);
      if (user) {
        if (isOnline) {
          await setDoc(doc(db, `users/${user.uid}/progress/${examName}`), {
            personalizedPlan: plan,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else {
          OfflineManager.addPendingSync({ 
            type: 'SAVE_PROGRESS', 
            examName, 
            data: { personalizedPlan: plan, updatedAt: new Date().toISOString() } 
          });
          alert("You are offline. Plan saved locally and will sync later.");
        }
      } else {
        localStorage.setItem(`personalizedPlan_${examName}`, plan);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlan(false);
    }
  };

  useEffect(() => {
    if (user) {
      const q = query(collection(db, `users/${user.uid}/flashcards`), where('topic', '==', flashcardTopic));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));
        setFlashcards(cards);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/flashcards`);
      });
      return () => unsubscribe();
    } else {
      const saved = localStorage.getItem(`flashcards_${examName}_${flashcardTopic}`);
      if (saved) setFlashcards(JSON.parse(saved));
    }
  }, [user, examName, flashcardTopic]);

  const handleGenerateFlashcards = async () => {
    setLoadingFlashcards(true);
    try {
      const newCards = await fetchFlashcards(examName, flashcardTopic);
      if (user) {
        if (isOnline) {
          for (const card of newCards) {
            await addDoc(collection(db, `users/${user.uid}/flashcards`), {
              ...card,
              mastery: 0,
              lastReviewed: serverTimestamp()
            });
          }
        } else {
          for (const card of newCards) {
            OfflineManager.addPendingSync({ 
              type: 'ADD_FLASHCARD', 
              data: { ...card, mastery: 0, lastReviewed: new Date().toISOString() } 
            });
          }
          const updated = [...flashcards, ...newCards];
          setFlashcards(updated);
          alert("You are offline. Flashcards added locally and will sync later.");
        }
      } else {
        const updated = [...flashcards, ...newCards];
        setFlashcards(updated);
        localStorage.setItem(`flashcards_${examName}_${flashcardTopic}`, JSON.stringify(updated));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFlashcards(false);
    }
  };

  const handleUpdateMastery = async (cardId: string, mastery: number) => {
    if (user && cardId) {
      if (isOnline) {
        try {
          await updateDoc(doc(db, `users/${user.uid}/flashcards`, cardId), {
            mastery,
            lastReviewed: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/flashcards/${cardId}`);
        }
      } else {
        OfflineManager.addPendingSync({ 
          type: 'UPDATE_FLASHCARD', 
          cardId, 
          data: { mastery, lastReviewed: new Date().toISOString() } 
        });
        const updated = flashcards.map(c => c.id === cardId ? { ...c, mastery } : c);
        setFlashcards(updated);
      }
    } else {
      const updated = flashcards.map(c => c.id === cardId ? { ...c, mastery } : c);
      setFlashcards(updated);
      localStorage.setItem(`flashcards_${examName}_${flashcardTopic}`, JSON.stringify(updated));
    }
    setIsFlipped(false);
    if (currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex(prev => prev + 1);
    } else {
      setCurrentCardIndex(0);
    }
  };

  useEffect(() => {
    assistantEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistantMessages]);

  const handleAssistantChat = async () => {
    if (!assistantInput.trim()) return;
    const userMsg: ChatMessage = { role: 'user', text: assistantInput };
    setAssistantMessages(prev => [...prev, userMsg]);
    setAssistantInput('');
    setLoadingAssistant(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: `You are an expert AI Teacher for the ${examName} exam. Help the student with their queries, provide study tips, and explain concepts clearly. Previous context: ${assistantMessages.map(m => m.text).join('\n')}` }] },
          { role: 'user', parts: [{ text: assistantInput }] }
        ],
        config: {
          systemInstruction: `You are a friendly, encouraging, and highly knowledgeable AI Teacher specializing in ${examName}. Your goal is to help the student succeed. Use Markdown for formatting.`,
        }
      });
      const modelMsg: ChatMessage = { role: 'model', text: response.text || "I'm sorry, I couldn't process that." };
      setAssistantMessages(prev => [...prev, modelMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAssistant(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTimerActive) {
      setIsTimerActive(false);
      setShowTimerModal(true);
    }
    return () => clearInterval(interval);
  }, [isTimerActive, timeLeft]);

  // Stop timer if user navigates away from practice tab
  useEffect(() => {
    if (activeTab !== 'practice') {
      setIsTimerActive(false);
    } else if (questions.length > 0 && selectedOption === null && currentQIndex < questions.length) {
      // Resume if returning to practice and session is ongoing
      // Actually, the requirement says "stop if user navigates away", 
      // which usually implies pausing or ending. I'll pause it.
      // But if they just started, it should be active.
    }
  }, [activeTab]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Progress Persistence
  const [hasSavedProgress, setHasSavedProgress] = useState(false);

  // Sync with Firestore
  useEffect(() => {
    if (!user) return;

    const progressRef = doc(db, 'users', user.uid, 'progress', examName);
    const unsubscribe = onSnapshot(progressRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setScore(data.score);
        setTopicScores(data.topicScores || {});
        setMasteryHistory(data.masteryHistory || {});
        setHasSavedProgress(true);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/progress/${examName}`);
    });

    return () => unsubscribe();
  }, [user, examName]);

  const savePracticeProgress = async () => {
    const progress = {
      uid: user?.uid || 'anonymous',
      examName,
      score,
      topicScores,
      masteryHistory,
      overview,
      personalizedPlan,
      practiceTopic,
      topicDifficulties,
      questions,
      currentQIndex,
      selectedOption,
      showExplanation,
      updatedAt: Timestamp.now()
    };

    if (user) {
      if (isOnline) {
        try {
          const progressRef = doc(db, 'users', user.uid, 'progress', examName);
          await setDoc(progressRef, progress);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/progress/${examName}`);
        }
      } else {
        OfflineManager.addPendingSync({ type: 'SAVE_PROGRESS', examName, data: progress });
        alert("You are offline. Progress saved locally and will sync when you're back online.");
      }
    } else {
      localStorage.setItem(`prepmind_progress_${examName}`, JSON.stringify(progress));
    }
    setHasSavedProgress(true);
  };

  const loadPracticeProgress = async () => {
    if (user) {
      try {
        const progressRef = doc(db, 'users', user.uid, 'progress', examName);
        const snapshot = await getDoc(progressRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          setScore(data.score);
          setTopicScores(data.topicScores || {});
          setMasteryHistory(data.masteryHistory || {});
          if (data.topicDifficulties) setTopicDifficulties(data.topicDifficulties);
          if (data.practiceTopic) setPracticeTopic(data.practiceTopic);
          if (data.questions) setQuestions(data.questions);
          if (data.currentQIndex !== undefined) setCurrentQIndex(data.currentQIndex);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}/progress/${examName}`);
      }
    } else {
      const saved = localStorage.getItem(`prepmind_progress_${examName}`);
      if (saved) {
        const progress = JSON.parse(saved);
        setPracticeTopic(progress.practiceTopic);
        if (progress.topicDifficulties) {
          setTopicDifficulties(progress.topicDifficulties);
        } else if (progress.difficulty) {
          const migrated: Record<string, string> = {};
          overview.topics.forEach(t => migrated[t] = progress.difficulty);
          setTopicDifficulties(migrated);
        }
        setQuestions(progress.questions);
        setCurrentQIndex(progress.currentQIndex);
        setSelectedOption(progress.selectedOption);
        setShowExplanation(progress.showExplanation);
        setScore(progress.score);
        setTopicScores(progress.topicScores || {});
        setMasteryHistory(progress.masteryHistory || {});
      }
    }
  };

  // Teach Me State
  const [teachingContent, setTeachingContent] = useState<string | null>(null);
  const [loadingTeach, setLoadingTeach] = useState(false);

  // Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleStartPractice = async () => {
    setLoadingQuestions(true);
    setShowExplanation(false);
    setSelectedOption(null);
    setCurrentQIndex(0);
    setTimeLeft(1800); // Reset to 30 mins
    try {
      const q = await fetchQuestions(examName, practiceTopic, topicDifficulties[practiceTopic]);
      setQuestions(q);
      setIsTimerActive(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleOptionClick = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    const isCorrect = idx === questions[currentQIndex].correctIndex;
    setScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    }));
    setTopicScores(prev => {
      const current = prev[practiceTopic] || { correct: 0, total: 0 };
      const newCorrect = current.correct + (isCorrect ? 1 : 0);
      const newTotal = current.total + 1;
      const newMastery = Math.round((newCorrect / newTotal) * 100);

      // Update history
      setMasteryHistory(hPrev => {
        const topicHistory = hPrev[practiceTopic] || [];
        // Only add a point if it's been a while or if it's the first point
        // To keep it simple, I'll just add it for now, but maybe throttle it later
        return {
          ...hPrev,
          [practiceTopic]: [...topicHistory, { timestamp: Date.now(), mastery: newMastery }]
        };
      });

      return {
        ...prev,
        [practiceTopic]: {
          correct: newCorrect,
          total: newTotal
        }
      };
    });
  };

  const handleTeachTopic = async (topic: string) => {
    if (selectedTopic === topic) {
      setSelectedTopic(null);
      return;
    }
    setSelectedTopic(topic);
    setLoadingTeach(true);
    try {
      const content = await fetchTopicContent(examName, topic);
      setTeachingContent(content);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTeach(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || loadingChat) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoadingChat(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are an expert tutor for the ${examName} exam. Help the user with their doubts. Be concise, accurate, and encouraging.`,
        },
      });
      // Simple multi-turn simulation for this demo
      const response = await chat.sendMessage({ message: userMsg });
      setChatMessages(prev => [...prev, { role: 'model', text: response.text }]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingChat(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06060a] text-white flex flex-col font-['Instrument_Sans']">
      {/* Sidebar / Nav */}
      <header className="border-b border-white/5 bg-[#0d0d14]/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#e8ff5a] rounded-xl flex items-center justify-center">
              <BrainCircuit className="w-6 h-6 text-black" />
            </div>
            <div>
              <h2 className="font-bold text-xl font-['Clash_Display']">PrepMind <span className="text-[#e8ff5a]">AI</span></h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">{examName}</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
            {[
              { id: 'overview', icon: Info, label: 'Overview' },
              { id: 'practice', icon: PenTool, label: 'Practice' },
              { id: 'teach', icon: GraduationCap, label: 'Teach Me' },
              { id: 'flashcards', icon: Layers, label: 'Flashcards' },
              { id: 'doubt', icon: MessageSquare, label: 'Ask Doubt' },
              { id: 'progress', icon: BarChart3, label: 'Progress' },
              { id: 'history', icon: RotateCcw, label: 'History' },
              { id: 'profile', icon: UserCircle, label: 'Profile' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === tab.id ? "bg-[#e8ff5a] text-black shadow-lg shadow-[#e8ff5a]/20" : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {!isOnline && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest">
                <WifiOff className="w-3 h-3" />
                Offline
              </div>
            )}
            {isOnline && OfflineManager.getPendingSync().length > 0 && (
              <button 
                onClick={() => window.location.reload()} 
                className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#e8ff5a]/10 border border-[#e8ff5a]/20 text-[#e8ff5a] text-[10px] font-bold uppercase tracking-widest hover:bg-[#e8ff5a] hover:text-black transition-all"
              >
                <CloudUpload className="w-3 h-3" />
                Sync Pending
              </button>
            )}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs text-gray-500 font-bold uppercase">Accuracy</span>
              <span className="text-[#e8ff5a] font-bold">{score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%</span>
            </div>
            {user ? (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 p-1 pr-4 rounded-full">
                <button onClick={() => setActiveTab('profile')} className="hover:scale-110 transition-transform">
                  <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full" />
                </button>
                <button onClick={() => signOut(auth)} className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Sign Out</button>
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#e8ff5a] to-[#b8cc48] p-[2px]">
                <div className="w-full h-full rounded-full bg-[#06060a] flex items-center justify-center text-xs font-bold">
                  SR
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center gap-3 text-[#e8ff5a]">
                    <Target className="w-6 h-6" />
                    <h3 className="text-2xl font-bold font-['Clash_Display']">Exam Pattern & Strategy</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Pattern</h4>
                      <div className="text-gray-300 leading-relaxed prose prose-invert max-w-none">
                        <ReactMarkdown>{overview.pattern}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Difficulty</h4>
                      <div className="inline-block px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold mb-2">
                        {overview.difficulty.split(' ')[0]}
                      </div>
                      <p className="text-gray-300 leading-relaxed">{overview.difficulty}</p>
                    </div>
                  </div>
                </section>

                <section className="bg-gradient-to-br from-[#e8ff5a]/10 to-transparent border border-[#e8ff5a]/20 rounded-3xl p-8 space-y-4">
                  <div className="flex items-center gap-3 text-[#e8ff5a]">
                    <GraduationCap className="w-6 h-6" />
                    <h3 className="text-2xl font-bold font-['Clash_Display']">Teacher's Advice</h3>
                  </div>
                  <p className="text-gray-300 leading-relaxed italic">
                    "Success in {examName} isn't just about hard work; it's about smart work. Focus on your weak topics first, and always review the AI explanations in the practice tab. I'm here to help you whenever you get stuck!"
                  </p>
                </section>

                <section className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center justify-between gap-3 text-[#e8ff5a]">
                    <div className="flex items-center gap-3">
                      <Zap className="w-6 h-6" />
                      <h3 className="text-2xl font-bold font-['Clash_Display']">
                        {personalizedPlan ? "Your Personalized Study Plan" : "30-Day Preparation Plan"}
                      </h3>
                    </div>
                    <button 
                      onClick={handleGeneratePlan}
                      disabled={loadingPlan}
                      className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-[#e8ff5a] hover:text-black transition-all disabled:opacity-50"
                    >
                      {loadingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : (personalizedPlan ? "Regenerate Plan" : "Personalize Plan")}
                    </button>
                  </div>
                  <div className="prose prose-invert max-w-none text-gray-300">
                    <ReactMarkdown>{personalizedPlan || overview.timePlan}</ReactMarkdown>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold font-['Clash_Display']">Daily Study Goals</h3>
                    <button 
                      onClick={handleRefreshGoals}
                      disabled={loadingGoals}
                      className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-[#e8ff5a] hover:text-black transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={cn("w-4 h-4", loadingGoals && "animate-spin")} />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {dailyGoals.length > 0 ? dailyGoals.map((goal, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="w-5 h-5 rounded-full border-2 border-[#e8ff5a] mt-0.5 shrink-0" />
                        <p className="text-sm text-gray-300">{goal}</p>
                      </div>
                    )) : (
                      <p className="text-sm text-gray-500 italic">No goals set for today. Click refresh to generate.</p>
                    )}
                  </div>
                </section>

                <section className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                  <h3 className="text-xl font-bold font-['Clash_Display']">Syllabus Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {overview.topics.map(topic => (
                      <button 
                        key={topic}
                        onClick={() => {
                          setPracticeTopic(topic);
                          setActiveTab('practice');
                        }}
                        className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm hover:border-[#e8ff5a]/50 hover:bg-[#e8ff5a]/5 transition-all"
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="bg-gradient-to-br from-[#e8ff5a] to-[#b8cc48] rounded-3xl p-8 text-black space-y-4">
                  <h3 className="text-xl font-bold font-['Clash_Display']">Pro Tip</h3>
                  <p className="font-medium opacity-80">
                    {overview.strategy.split('.')[0]}. Focus on high-weightage topics first!
                  </p>
                  <button 
                    onClick={() => setActiveTab('practice')}
                    className="w-full py-3 bg-black text-white rounded-xl font-bold flex items-center justify-center gap-2"
                  >
                    Start Practice <ChevronRight className="w-4 h-4" />
                  </button>
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'practice' && (
            <motion.div 
              key="practice"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div className="bg-[#0d0d14] border border-white/5 rounded-3xl p-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Topic</label>
                  <select 
                    value={practiceTopic}
                    onChange={(e) => setPracticeTopic(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 outline-none focus:border-[#e8ff5a]"
                  >
                    {overview.topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Difficulty</label>
                  <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                    {['Easy', 'Medium', 'Hard'].map(d => (
                      <button
                        key={d}
                        onClick={() => setTopicDifficulties(prev => ({ ...prev, [practiceTopic]: d }))}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                          topicDifficulties[practiceTopic] === d ? "bg-[#e8ff5a] text-black" : "text-gray-400 hover:text-white"
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 self-end">
                  {hasSavedProgress && questions.length === 0 && (
                    <button 
                      onClick={() => {
                        loadPracticeProgress();
                        setIsTimerActive(true);
                      }}
                      className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 border border-white/10 hover:bg-white/20 transition-all"
                    >
                      <RefreshCw className="w-5 h-5" />
                      Resume Practice
                    </button>
                  )}
                  <button 
                    onClick={handleStartPractice}
                    disabled={loadingQuestions}
                    className="bg-[#e8ff5a] text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    {loadingQuestions ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                    Generate Questions
                  </button>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-[#e8ff5a]/10 rounded-full flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5 text-[#e8ff5a]" />
                </div>
                <p className="text-xs text-gray-400 italic">
                  "Teacher's Tip: Don't rush! Read every option carefully. Even if you think you know the answer, the other options might reveal a common trap."
                </p>
              </div>

              {questions.length > 0 && (
                <div className="flex justify-between items-center px-2">
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full border font-mono font-bold",
                    timeLeft < 300 ? "bg-red-500/10 border-red-500/50 text-red-400 animate-pulse" : "bg-white/5 border-white/10 text-[#e8ff5a]"
                  )}>
                    <RefreshCw className={cn("w-4 h-4", isTimerActive && "animate-spin")} />
                    {formatTime(timeLeft)}
                  </div>
                  <button 
                    onClick={savePracticeProgress}
                    className="text-xs font-bold text-[#e8ff5a] flex items-center gap-1 hover:underline"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Save Current Progress
                  </button>
                </div>
              )}

              {loadingQuestions ? (
                <div className="h-96 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-12 h-12 text-[#e8ff5a] animate-spin" />
                  <p className="text-gray-500">AI is crafting fresh questions for you...</p>
                </div>
              ) : questions.length > 0 ? (
                <div className="space-y-6">
                  <div className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-8">
                    <div className="flex justify-between items-center">
                      <span className="text-[#e8ff5a] font-bold">Question {currentQIndex + 1} of {questions.length}</span>
                      <div className="flex gap-1">
                        {questions.map((_, i) => (
                          <div key={i} className={cn("h-1 w-6 rounded-full", i === currentQIndex ? "bg-[#e8ff5a]" : "bg-white/10")} />
                        ))}
                      </div>
                    </div>

                    <h3 className="text-2xl font-medium leading-relaxed">
                      {questions[currentQIndex].question}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {questions[currentQIndex].options.map((option, idx) => {
                        const isCorrect = idx === questions[currentQIndex].correctIndex;
                        const isSelected = selectedOption === idx;
                        
                        return (
                          <button
                            key={idx}
                            onClick={() => handleOptionClick(idx)}
                            disabled={selectedOption !== null}
                            className={cn(
                              "p-6 rounded-2xl border text-left transition-all flex items-center justify-between group",
                              selectedOption === null 
                                ? "bg-white/5 border-white/10 hover:border-[#e8ff5a]/50 hover:bg-white/10" 
                                : isSelected
                                  ? isCorrect ? "bg-green-500/10 border-green-500 text-green-400" : "bg-red-500/10 border-red-500 text-red-400"
                                  : isCorrect ? "bg-green-500/10 border-green-500/50 text-green-400" : "bg-white/5 border-white/5 opacity-50"
                            )}
                          >
                            <span className="font-medium">{option}</span>
                            {selectedOption !== null && isCorrect && <CheckCircle2 className="w-5 h-5" />}
                            {selectedOption !== null && isSelected && !isCorrect && <XCircle className="w-5 h-5" />}
                          </button>
                        );
                      })}
                    </div>

                    {selectedOption !== null && (
                      <div className="flex justify-between items-center pt-6 border-t border-white/5">
                        {!showExplanation ? (
                          <button 
                            onClick={() => setShowExplanation(true)}
                            className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 border border-white/10 hover:bg-white/20 transition-all"
                          >
                            <Info className="w-5 h-5" />
                            Reveal AI Explanation
                          </button>
                        ) : <div />}
                        
                        {currentQIndex < questions.length - 1 ? (
                          <button 
                            onClick={() => {
                              setCurrentQIndex(prev => prev + 1);
                              setSelectedOption(null);
                              setShowExplanation(false);
                            }}
                            className="bg-white text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2"
                          >
                            Next Question <ArrowRight className="w-5 h-5" />
                          </button>
                        ) : (
                          <button 
                            onClick={async () => {
                              setIsTimerActive(false);
                              await savePracticeProgress();
                              handleStartPractice();
                            }}
                            className="bg-[#e8ff5a] text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2"
                          >
                            Finish & Save Progress <RefreshCw className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    )}

                    {showExplanation && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 pt-6"
                      >
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 space-y-3">
                          <div className="flex items-center gap-2 text-blue-400 font-bold text-sm uppercase tracking-widest">
                            <Info className="w-4 h-4" />
                            AI Explanation
                          </div>
                          <p className="text-gray-300 leading-relaxed">{questions[currentQIndex].explanation}</p>
                        </div>
                        <div className="bg-[#e8ff5a]/5 border border-[#e8ff5a]/20 rounded-2xl p-6 space-y-3">
                          <div className="flex items-center gap-2 text-[#e8ff5a] font-bold text-sm uppercase tracking-widest">
                            <Zap className="w-4 h-4" />
                            Shortcut Trick
                          </div>
                          <p className="text-gray-300 leading-relaxed italic">"{questions[currentQIndex].trick}"</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-96 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                    <PenTool className="w-10 h-10 text-gray-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">Ready to test your skills?</h3>
                    <p className="text-gray-500 max-w-xs">Select a topic and difficulty to generate your custom practice set.</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'teach' && (
            <motion.div 
              key="teach"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-4xl mx-auto space-y-4"
            >
              <div className="grid grid-cols-1 gap-4">
                {overview.topics.map((topic, i) => (
                  <div key={topic} className="bg-[#0d0d14] border border-white/5 rounded-2xl overflow-hidden">
                    <button 
                      onClick={() => handleTeachTopic(topic)}
                      className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold text-gray-500">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <h4 className="text-lg font-bold">{topic}</h4>
                      </div>
                      <ChevronRight className={cn("w-5 h-5 text-gray-500 transition-transform", selectedTopic === topic && "rotate-90")} />
                    </button>
                    
                    <AnimatePresence>
                      {selectedTopic === topic && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-white/5"
                        >
                          <div className="p-8 prose prose-invert max-w-none">
                            {loadingTeach ? (
                              <div className="flex items-center gap-3 text-gray-500">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Preparing lesson...
                              </div>
                            ) : (
                              <div className="space-y-6">
                                <ReactMarkdown>{teachingContent || ''}</ReactMarkdown>
                                
                                <div className="pt-6 border-t border-white/5 space-y-6">
                                  {videoUrl[topic] ? (
                                    <div className="space-y-2">
                                      <h5 className="text-sm font-bold uppercase tracking-widest text-gray-500">AI Video Explanation</h5>
                                      <video 
                                        src={videoUrl[topic]} 
                                        controls 
                                        className="w-full rounded-2xl border border-white/10 shadow-2xl"
                                      />
                                    </div>
                                  ) : (
                                    <div className="bg-white/5 rounded-2xl p-6 flex flex-col items-center text-center space-y-4 border border-white/5">
                                      <div className="w-12 h-12 bg-[#e8ff5a]/20 rounded-full flex items-center justify-center">
                                        <Zap className="w-6 h-6 text-[#e8ff5a]" />
                                      </div>
                                      <div className="space-y-1">
                                        <h5 className="font-bold">AI Video Explanation</h5>
                                        <p className="text-sm text-gray-500">Generate a personalized video lesson for this topic using AI.</p>
                                      </div>
                                      <button 
                                        onClick={() => handleGenerateVideo(topic)}
                                        disabled={loadingVideo[topic]}
                                        className="bg-[#e8ff5a] text-black px-6 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-[#d4e84d] transition-all disabled:opacity-50"
                                      >
                                        {loadingVideo[topic] ? (
                                          <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Generating Video...
                                          </>
                                        ) : (
                                          <>
                                            <Zap className="w-4 h-4" />
                                            Generate Video
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}

                                  <div className="flex justify-end">
                                    <button 
                                      onClick={() => {
                                        setIsAssistantOpen(true);
                                        setAssistantInput(`Can you explain more about "${topic}"? I just read the lesson but I have some questions.`);
                                      }}
                                      className="flex items-center gap-2 text-[#e8ff5a] font-bold text-sm hover:underline"
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                      Ask Teacher about this topic
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'doubt' && (
            <motion.div 
              key="doubt"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto h-[calc(100vh-200px)] flex flex-col bg-[#0d0d14] border border-white/5 rounded-3xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 bg-white/5 flex items-center gap-3">
                <div className="w-10 h-10 bg-[#e8ff5a] rounded-full flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h3 className="font-bold">AI Teacher Assistant</h3>
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Online & Ready to teach
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                    <GraduationCap className="w-12 h-12" />
                    <p className="max-w-xs">I'm your AI Teacher. Ask me anything about {examName} concepts, strategy, or specific problems.</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-[#e8ff5a] text-black font-medium rounded-tr-none" 
                        : "bg-white/5 border border-white/10 text-gray-200 rounded-tl-none prose prose-invert prose-sm"
                    )}>
                      {msg.role === 'model' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                    </div>
                  </div>
                ))}
                {loadingChat && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none flex gap-1">
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-6 border-t border-white/5 bg-white/5">
                <div className="flex gap-4">
                  <input 
                    type="text" 
                    placeholder="Type your doubt here..."
                    className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#e8ff5a]"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button 
                    onClick={handleSendMessage}
                    disabled={loadingChat || !chatInput.trim()}
                    className="bg-[#e8ff5a] text-black px-6 py-3 rounded-xl font-bold disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'flashcards' && (
            <motion.div 
              key="flashcards"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="bg-[#0d0d14] border border-white/5 rounded-3xl p-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Topic</label>
                  <select 
                    value={flashcardTopic}
                    onChange={(e) => setFlashcardTopic(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 outline-none focus:border-[#e8ff5a]"
                  >
                    {overview.topics.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button 
                  onClick={handleGenerateFlashcards}
                  disabled={loadingFlashcards}
                  className="bg-[#e8ff5a] text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 disabled:opacity-50 self-end"
                >
                  {loadingFlashcards ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Generate Flashcards
                </button>
              </div>

              {flashcards.length > 0 ? (
                <div className="space-y-8">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold font-['Clash_Display']">Reviewing: {flashcardTopic}</h3>
                    <span className="text-gray-500 text-sm font-bold">{currentCardIndex + 1} / {flashcards.length}</span>
                  </div>

                  <div className="perspective-1000 h-[400px] w-full cursor-pointer group" onClick={() => setIsFlipped(!isFlipped)}>
                    <motion.div 
                      animate={{ rotateY: isFlipped ? 180 : 0 }}
                      transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                      className="relative w-full h-full preserve-3d"
                    >
                      {/* Front */}
                      <div className="absolute inset-0 backface-hidden bg-[#0d0d14] border-2 border-white/5 rounded-[40px] p-12 flex flex-col items-center justify-center text-center space-y-6 shadow-2xl">
                        <div className="w-12 h-12 bg-[#e8ff5a]/10 rounded-2xl flex items-center justify-center">
                          <BrainCircuit className="w-6 h-6 text-[#e8ff5a]" />
                        </div>
                        <h2 className="text-3xl font-bold leading-tight">{flashcards[currentCardIndex].front}</h2>
                        <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Click to reveal answer</p>
                      </div>

                      {/* Back */}
                      <div className="absolute inset-0 backface-hidden bg-[#e8ff5a] text-black border-2 border-[#e8ff5a] rounded-[40px] p-12 flex flex-col items-center justify-center text-center space-y-6 shadow-2xl rotate-y-180">
                        <div className="w-12 h-12 bg-black/10 rounded-2xl flex items-center justify-center">
                          <Info className="w-6 h-6 text-black" />
                        </div>
                        <p className="text-xl font-medium leading-relaxed">{flashcards[currentCardIndex].back}</p>
                        <p className="text-black/40 text-sm font-bold uppercase tracking-widest">Click to flip back</p>
                      </div>
                    </motion.div>
                  </div>

                  <div className="flex flex-col items-center gap-6">
                    <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">How well did you know this?</p>
                    <div className="flex gap-3">
                      {[1, 2, 3, 4, 5].map(level => (
                        <button
                          key={level}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateMastery(flashcards[currentCardIndex].id!, level);
                          }}
                          className="w-12 h-12 rounded-xl border border-white/10 bg-white/5 hover:bg-[#e8ff5a] hover:text-black transition-all font-bold text-lg flex items-center justify-center"
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-center gap-4">
                    <button 
                      onClick={() => {
                        setCurrentCardIndex(prev => (prev - 1 + flashcards.length) % flashcards.length);
                        setIsFlipped(false);
                      }}
                      className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                    >
                      <RotateCcw className="w-6 h-6" />
                    </button>
                    <button 
                      onClick={() => {
                        setCurrentCardIndex(prev => (prev + 1) % flashcards.length);
                        setIsFlipped(false);
                      }}
                      className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                    >
                      <ArrowRight className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-96 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                    <Layers className="w-10 h-10 text-gray-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold">No flashcards yet</h3>
                    <p className="text-gray-500 max-w-xs">Generate flashcards for this topic to start your active recall session.</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold font-['Clash_Display']">Exam History</h2>
                <div className="text-sm text-gray-500 font-bold uppercase tracking-widest">
                  {history.length} Exams Prepared
                </div>
              </div>

              {loadingHistory ? (
                <div className="h-96 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="w-12 h-12 text-[#e8ff5a] animate-spin" />
                  <p className="text-gray-500">Retrieving your exam history...</p>
                </div>
              ) : history.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {history.map((item, idx) => (
                    <div key={idx} className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6 hover:border-[#e8ff5a]/30 transition-all group">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-2xl font-bold font-['Clash_Display'] group-hover:text-[#e8ff5a] transition-colors">{item.examName}</h3>
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
                            Last Updated: {item.updatedAt?.toDate().toLocaleDateString()}
                          </p>
                        </div>
                        <div className="bg-[#e8ff5a] text-black px-3 py-1 rounded-lg text-xs font-black">
                          {item.score.total > 0 ? Math.round((item.score.correct / item.score.total) * 100) : 0}%
                        </div>
                      </div>

                      {item.overview && (
                        <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5">
                          <div>
                            <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Topics</span>
                            <span className="text-sm text-gray-300">{item.overview.topics?.length || 0} Modules</span>
                          </div>
                          <div>
                            <span className="block text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Difficulty</span>
                            <span className="text-sm text-gray-300">{item.overview.difficulty?.split(' ')[0] || 'N/A'}</span>
                          </div>
                        </div>
                      )}

                      <div className="space-y-4">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-gray-500">
                          <span>Overall Accuracy</span>
                          <span className="text-white">{item.score.correct} / {item.score.total}</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[#e8ff5a]" 
                            style={{ width: `${item.score.total > 0 ? (item.score.correct / item.score.total) * 100 : 0}%` }} 
                          />
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          alert(`Switching to ${item.examName} context... (Feature coming soon)`);
                        }}
                        className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all"
                      >
                        View Details
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-96 flex flex-col items-center justify-center text-center space-y-6 bg-[#0d0d14] border border-dashed border-white/10 rounded-3xl p-12">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                    <RotateCcw className="w-10 h-10 text-gray-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold font-['Clash_Display']">No History Yet</h3>
                    <p className="text-gray-500 max-w-xs">Start preparing for an exam and save your progress to see it here.</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('overview')}
                    className="bg-[#e8ff5a] text-black px-8 py-3 rounded-xl font-bold"
                  >
                    Start Now
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold font-['Clash_Display']">User Profile</h2>
                <p className="text-gray-500">Manage your account and profile information</p>
              </div>

              <div className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-8">
                <div className="flex flex-col items-center space-y-6">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[#e8ff5a]/20 group-hover:border-[#e8ff5a]/50 transition-all">
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                          <UserCircle className="w-16 h-16 text-gray-500" />
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={isCameraActive ? stopCamera : startCamera}
                      className="absolute bottom-0 right-0 p-2 bg-[#e8ff5a] text-black rounded-full shadow-lg hover:scale-110 transition-all"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="text-center space-y-1">
                    <h3 className="text-xl font-bold">{user?.displayName || 'Anonymous User'}</h3>
                    <p className="text-gray-500">{user?.email || 'No email provided'}</p>
                  </div>
                </div>

                {isCameraActive && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-4"
                  >
                    <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 border-2 border-dashed border-[#e8ff5a]/50 rounded-full" />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={capturePhoto}
                        className="flex-1 bg-[#e8ff5a] text-black py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                      >
                        <Camera className="w-5 h-5" />
                        Capture Photo
                      </button>
                      <button 
                        onClick={stopCamera}
                        className="px-6 bg-white/5 border border-white/10 py-3 rounded-xl font-bold text-gray-400 hover:text-white transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}

                {capturedImage && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-4"
                  >
                    <div className="text-sm font-bold uppercase tracking-widest text-gray-500">Preview</div>
                    <div className="flex items-center gap-6 bg-white/5 p-4 rounded-2xl border border-white/10">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#e8ff5a]">
                        <img src={capturedImage} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <p className="text-sm text-gray-400">Looking good! Would you like to set this as your new profile picture?</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={handleUpdateProfilePic}
                            disabled={updatingProfile}
                            className="flex-1 bg-[#e8ff5a] text-black py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {updatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save Changes</>}
                          </button>
                          <button 
                            onClick={() => setCapturedImage(null)}
                            className="px-4 bg-white/5 border border-white/10 py-2 rounded-lg font-bold text-gray-400 hover:text-white transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                <canvas ref={canvasRef} className="hidden" />

                <div className="grid grid-cols-1 gap-4 pt-8 border-t border-white/5">
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10 space-y-4">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Account Statistics</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <span className="block text-xl font-bold text-[#e8ff5a]">{history.length}</span>
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Exams</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-xl font-bold text-[#e8ff5a]">{score.total}</span>
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Questions</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-xl font-bold text-[#e8ff5a]">{score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%</span>
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Accuracy</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'progress' && (
            <motion.div 
              key="progress"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <div className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                <h3 className="text-xl font-bold font-['Clash_Display']">Overall Performance</h3>
                <div className="flex items-center justify-center py-8">
                  <div className="relative w-48 h-48">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="96" cy="96" r="88" fill="none" stroke="currentColor" strokeWidth="12" className="text-white/5" />
                      <circle 
                        cx="96" 
                        cy="96" 
                        r="88" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="12" 
                        strokeDasharray={552}
                        strokeDashoffset={552 - (552 * (score.total > 0 ? score.correct / score.total : 0))}
                        className="text-[#e8ff5a] transition-all duration-1000" 
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-bold">{score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%</span>
                      <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Accuracy</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-2xl text-center">
                    <span className="block text-2xl font-bold text-green-400">{score.correct}</span>
                    <span className="text-xs text-gray-500 font-bold uppercase">Correct</span>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl text-center">
                    <span className="block text-2xl font-bold text-red-400">{score.total - score.correct}</span>
                    <span className="text-xs text-gray-500 font-bold uppercase">Wrong</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                <h3 className="text-xl font-bold font-['Clash_Display']">Topic-wise Mastery</h3>
                <div className="space-y-6">
                  {overview.topics.map((topic) => {
                    const topicScore = topicScores[topic] || { correct: 0, total: 0 };
                    const mastery = topicScore.total > 0 ? Math.round((topicScore.correct / topicScore.total) * 100) : 0;
                    
                    return (
                      <div key={topic} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-gray-300">{topic}</span>
                          <span className="text-[#e8ff5a] font-bold">{mastery}%</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${mastery}%` }}
                            className="h-full bg-[#e8ff5a]"
                          />
                        </div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                          {topicScore.correct} / {topicScore.total} Correct
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-3 bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h3 className="text-xl font-bold font-['Clash_Display']">Mastery Trend</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">Filter:</span>
                    <select 
                      value={chartTopic}
                      onChange={(e) => setChartTopic(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm outline-none focus:border-[#e8ff5a]"
                    >
                      <option value="All">All Topics</option>
                      {overview.topics.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                
                <div className="h-[300px] w-full">
                  {Object.keys(masteryHistory).length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2 border border-dashed border-white/10 rounded-2xl">
                      <BarChart3 className="w-8 h-8 opacity-20" />
                      <p className="text-sm">Complete practice sessions to see your mastery trend</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getChartData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis 
                          dataKey="time" 
                          stroke="#666" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis 
                          stroke="#666" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                          domain={[0, 100]}
                          tickFormatter={(val) => `${val}%`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          itemStyle={{ fontSize: '12px' }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px' }} />
                        {(chartTopic === 'All' ? overview.topics : [chartTopic]).map((topic, idx) => (
                          <Line 
                            key={topic}
                            type="monotone" 
                            dataKey={topic} 
                            stroke={CHART_COLORS[idx % CHART_COLORS.length]} 
                            strokeWidth={2}
                            dot={{ r: 3, fill: CHART_COLORS[idx % CHART_COLORS.length], strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-3 bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                <h3 className="text-xl font-bold font-['Clash_Display']">Daily Growth</h3>
                <div className="h-[300px] w-full">
                  {getDailyGrowthData().length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-2 border border-dashed border-white/10 rounded-2xl">
                      <BarChart3 className="w-8 h-8 opacity-20" />
                      <p className="text-sm">Practice more to see your daily growth</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getDailyGrowthData()}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#666" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                        />
                        <YAxis 
                          stroke="#666" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false} 
                          domain={[0, 100]}
                          tickFormatter={(val) => `${val}%`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          itemStyle={{ fontSize: '12px' }}
                        />
                        <Bar dataKey="growth" radius={[4, 4, 0, 0]}>
                          {getDailyGrowthData().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.growth > 70 ? '#e8ff5a' : '#5afff3'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-3 bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                <h3 className="text-xl font-bold font-['Clash_Display']">Individual Topic Trends</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {overview.topics.map((topic, idx) => (
                    <div key={topic} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm truncate pr-2">{topic}</h4>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
                      </div>
                      <div className="h-[150px] w-full">
                        {(!masteryHistory[topic] || masteryHistory[topic].length === 0) ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-[10px] border border-dashed border-white/10 rounded-xl">
                            No data yet
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={getChartData([topic])}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                              <XAxis 
                                dataKey="time" 
                                hide
                              />
                              <YAxis 
                                hide
                                domain={[0, 100]}
                              />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#0d0d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                              />
                              <Line 
                                type="monotone" 
                                dataKey={topic} 
                                stroke={CHART_COLORS[idx % CHART_COLORS.length]} 
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                connectNulls
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-br from-[#e8ff5a]/10 to-transparent border border-[#e8ff5a]/20 rounded-3xl p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[#e8ff5a]">
                    <Zap className="w-6 h-6" />
                    <h3 className="text-2xl font-bold font-['Clash_Display']">AI Performance Summary</h3>
                  </div>
                  {score.total > 0 && (
                    <button 
                      onClick={handleGenerateSummary}
                      disabled={loadingSummary}
                      className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-[#e8ff5a] hover:text-black transition-all disabled:opacity-50"
                    >
                      {loadingSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh Summary"}
                    </button>
                  )}
                </div>

                <div className="prose prose-invert max-w-none text-gray-300">
                  {loadingSummary ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <Loader2 className="w-8 h-8 text-[#e8ff5a] animate-spin" />
                      <p className="text-sm text-gray-500">Analyzing your performance data...</p>
                    </div>
                  ) : performanceSummary ? (
                    <ReactMarkdown>{performanceSummary}</ReactMarkdown>
                  ) : (
                    <div className="text-center py-12 space-y-4">
                      <BarChart3 className="w-12 h-12 text-gray-500 mx-auto opacity-20" />
                      <p className="text-gray-400">
                        {score.total === 0 
                          ? "Start practicing to get personalized AI insights on your performance!" 
                          : "Click 'Refresh Summary' to generate your performance analysis."}
                      </p>
                      {score.total === 0 && (
                        <button 
                          onClick={() => setActiveTab('practice')}
                          className="bg-[#e8ff5a] text-black px-8 py-3 rounded-xl font-bold"
                        >
                          Start Practice
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showTimerModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-[#0d0d14] border border-white/10 rounded-3xl p-8 max-w-md w-full text-center space-y-6"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                <RefreshCw className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold font-['Clash_Display']">Time's Up!</h3>
                <p className="text-gray-400">Your 30-minute practice session has ended. Would you like to save your current progress or discard it?</p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    savePracticeProgress();
                    setShowTimerModal(false);
                    setQuestions([]);
                  }}
                  className="bg-[#e8ff5a] text-black py-4 rounded-xl font-bold"
                >
                  Save Progress
                </button>
                <button 
                  onClick={() => {
                    setShowTimerModal(false);
                    setQuestions([]);
                  }}
                  className="bg-white/5 text-white py-4 rounded-xl font-bold border border-white/10"
                >
                  Discard & Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating AI Assistant Teacher */}
      <div className="fixed bottom-8 right-8 z-50">
        <AnimatePresence>
          {isAssistantOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-20 right-0 w-[350px] h-[500px] bg-[#0d0d14] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-4 bg-[#e8ff5a] text-black flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                    <GraduationCap className="w-5 h-5 text-[#e8ff5a]" />
                  </div>
                  <span className="font-bold">AI Assistant Teacher</span>
                </div>
                <button onClick={() => setIsAssistantOpen(false)} className="p-1 hover:bg-black/10 rounded-lg transition-colors">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {assistantMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-40">
                    <BrainCircuit className="w-10 h-10" />
                    <p className="text-xs">Ask me anything about your exam prep!</p>
                  </div>
                )}
                {assistantMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] p-3 rounded-xl text-xs leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-[#e8ff5a] text-black font-medium" 
                        : "bg-white/5 border border-white/10 text-gray-200"
                    )}>
                      {msg.role === 'model' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                    </div>
                  </div>
                ))}
                {loadingAssistant && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 p-3 rounded-xl flex gap-1">
                      <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce" />
                      <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1 h-1 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                  </div>
                )}
                <div ref={assistantEndRef} />
              </div>

              <div className="p-4 border-t border-white/5">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Ask your teacher..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-[#e8ff5a]"
                    value={assistantInput}
                    onChange={(e) => setAssistantInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAssistantChat()}
                  />
                  <button 
                    onClick={handleAssistantChat}
                    className="bg-[#e8ff5a] text-black p-2 rounded-xl"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsAssistantOpen(!isAssistantOpen)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300",
            isAssistantOpen ? "bg-white text-black" : "bg-[#e8ff5a] text-black"
          )}
        >
          {isAssistantOpen ? <XCircle className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
        </motion.button>
      </div>
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<AppState>('landing');
  const [examName, setExamName] = useState('');
  const [overview, setOverview] = useState<ExamOverview | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setState('landing');
    } catch (err) {
      console.error(err);
    }
  };

  const handleStart = async (name: string) => {
    setExamName(name);
    setState('loading');
    try {
      const data = await fetchExamOverview(name);
      setOverview(data);
      setState('dashboard');
    } catch (err) {
      console.error(err);
      setState('landing');
      alert("Failed to fetch exam details. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#06060a]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap');
        @import url('https://api.fontshare.com/v2/css?f[]=clash-display@400,500,600,700&display=swap');
        
        body {
          font-family: 'Instrument Sans', sans-serif;
        }

        .font-clash {
          font-family: 'Clash Display', sans-serif;
        }

        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #06060a;
        }
        ::-webkit-scrollbar-thumb {
          background: #1a1a24;
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #252533;
        }

        .perspective-1000 {
          perspective: 1000px;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
      
      {state === 'landing' && <Landing onStart={handleStart} user={user} onLoginClick={() => setState('login')} />}
      {state === 'login' && <LoginPage onLogin={handleLogin} onBack={() => setState('landing')} />}
      {state === 'loading' && <LoadingScreen examName={examName} />}
      {state === 'dashboard' && overview && <Dashboard examName={examName} overview={overview} user={user} />}

    </div>
  );
}
