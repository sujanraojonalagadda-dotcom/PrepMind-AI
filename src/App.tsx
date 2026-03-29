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
  Target
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type AppState = 'landing' | 'loading' | 'dashboard';
type Tab = 'overview' | 'practice' | 'teach' | 'doubt' | 'progress';

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

// --- Gemini Service ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const fetchExamOverview = async (examName: string): Promise<ExamOverview> => {
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
  return JSON.parse(response.text);
};

const fetchQuestions = async (examName: string, topic: string, difficulty: string): Promise<Question[]> => {
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
  return JSON.parse(response.text);
};

const fetchTopicContent = async (examName: string, topic: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Teach me the topic "${topic}" for the exam "${examName}". 
    Include:
    - Core concepts
    - Important formulas
    - Shortcut tricks
    - 2 solved examples
    Use Markdown formatting.`,
  });
  return response.text;
};

// --- Components ---

const Landing = ({ onStart }: { onStart: (name: string) => void }) => {
  const [input, setInput] = useState('');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#06060a] text-white font-['Instrument_Sans']">
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

const Dashboard = ({ examName, overview }: { examName: string, overview: ExamOverview }) => {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  
  // Practice State
  const [practiceTopic, setPracticeTopic] = useState(overview.topics[0]);
  const [difficulty, setDifficulty] = useState('Medium');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [topicScores, setTopicScores] = useState<Record<string, { correct: number, total: number }>>({});

  // Progress Persistence
  const [hasSavedProgress, setHasSavedProgress] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`prepmind_progress_${examName}`);
    if (saved) {
      setHasSavedProgress(true);
    }
  }, [examName]);

  const savePracticeProgress = () => {
    const progress = {
      practiceTopic,
      difficulty,
      questions,
      currentQIndex,
      selectedOption,
      showExplanation,
      score,
      topicScores,
      examName
    };
    localStorage.setItem(`prepmind_progress_${examName}`, JSON.stringify(progress));
    setHasSavedProgress(true);
  };

  const loadPracticeProgress = () => {
    const saved = localStorage.getItem(`prepmind_progress_${examName}`);
    if (saved) {
      const progress = JSON.parse(saved);
      setPracticeTopic(progress.practiceTopic);
      setDifficulty(progress.difficulty);
      setQuestions(progress.questions);
      setCurrentQIndex(progress.currentQIndex);
      setSelectedOption(progress.selectedOption);
      setShowExplanation(progress.showExplanation);
      setScore(progress.score);
      setTopicScores(progress.topicScores || {});
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
    try {
      const q = await fetchQuestions(examName, practiceTopic, difficulty);
      setQuestions(q);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleOptionClick = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    setShowExplanation(true);
    const isCorrect = idx === questions[currentQIndex].correctIndex;
    setScore(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1
    }));
    setTopicScores(prev => {
      const current = prev[practiceTopic] || { correct: 0, total: 0 };
      return {
        ...prev,
        [practiceTopic]: {
          correct: current.correct + (isCorrect ? 1 : 0),
          total: current.total + 1
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
              { id: 'doubt', icon: MessageSquare, label: 'Ask Doubt' },
              { id: 'progress', icon: BarChart3, label: 'Progress' },
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
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs text-gray-500 font-bold uppercase">Accuracy</span>
              <span className="text-[#e8ff5a] font-bold">{score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#e8ff5a] to-[#b8cc48] p-[2px]">
              <div className="w-full h-full rounded-full bg-[#06060a] flex items-center justify-center text-xs font-bold">
                SR
              </div>
            </div>
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

                <section className="bg-[#0d0d14] border border-white/5 rounded-3xl p-8 space-y-6">
                  <div className="flex items-center gap-3 text-[#e8ff5a]">
                    <Zap className="w-6 h-6" />
                    <h3 className="text-2xl font-bold font-['Clash_Display']">30-Day Preparation Plan</h3>
                  </div>
                  <div className="prose prose-invert max-w-none text-gray-300">
                    <ReactMarkdown>{overview.timePlan}</ReactMarkdown>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
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
                        onClick={() => setDifficulty(d)}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                          difficulty === d ? "bg-[#e8ff5a] text-black" : "text-gray-400 hover:text-white"
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
                      onClick={loadPracticeProgress}
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

              {questions.length > 0 && (
                <div className="flex justify-end">
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

                    {showExplanation && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6 pt-6 border-t border-white/5"
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

                        <div className="flex justify-end">
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
                              onClick={handleStartPractice}
                              className="bg-[#e8ff5a] text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2"
                            >
                              Finish & Restart <RefreshCw className="w-5 h-5" />
                            </button>
                          )}
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
                              <ReactMarkdown>{teachingContent || ''}</ReactMarkdown>
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
                  <BrainCircuit className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h3 className="font-bold">PrepMind AI Tutor</h3>
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                    Online & Ready to help
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                    <MessageSquare className="w-12 h-12" />
                    <p className="max-w-xs">Ask anything about {examName} concepts, strategy, or specific problems.</p>
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

              <div className="md:col-span-2 lg:col-span-3 bg-gradient-to-r from-[#e8ff5a]/10 to-transparent border border-[#e8ff5a]/20 rounded-3xl p-8 flex flex-col md:flex-row items-center gap-8">
                <div className="w-20 h-20 bg-[#e8ff5a] rounded-2xl flex items-center justify-center shrink-0">
                  <Zap className="w-10 h-10 text-black" />
                </div>
                <div className="space-y-2 text-center md:text-left">
                  <h3 className="text-2xl font-bold font-['Clash_Display']">AI Insight</h3>
                  <p className="text-gray-400 leading-relaxed">
                    {score.total === 0 ? (
                      "Start practicing to get personalized AI insights on your performance!"
                    ) : (
                      <>
                        Based on your practice sessions, your current overall accuracy is <span className="text-white font-bold">{Math.round((score.correct / score.total) * 100)}%</span>. 
                        {Object.entries(topicScores).length > 0 && (
                          <span> You've attempted questions in <span className="text-white font-bold">{Object.keys(topicScores).length}</span> topics.</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('practice')}
                  className="bg-[#e8ff5a] text-black px-8 py-4 rounded-xl font-bold shrink-0"
                >
                  Improve Now
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default function App() {
  const [state, setState] = useState<AppState>('landing');
  const [examName, setExamName] = useState('');
  const [overview, setOverview] = useState<ExamOverview | null>(null);

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
      `}</style>
      
      {state === 'landing' && <Landing onStart={handleStart} />}
      {state === 'loading' && <LoadingScreen examName={examName} />}
      {state === 'dashboard' && overview && <Dashboard examName={examName} overview={overview} />}
    </div>
  );
}
