
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SET_SIZES = [5, 10, 15, 20];
const TRIALS_PER_SET = 10;
const TIMEOUT_MS = 4000;

enum ExperimentState {
  SETUP = 'SETUP',
  INSTRUCTIONS = 'INSTRUCTIONS',
  FIXATION = 'FIXATION',
  TRIAL = 'TRIAL',
  FEEDBACK = 'FEEDBACK',
  RESULTS = 'RESULTS'
}

const StimulusIcon = ({ type, color }: { type: string; color?: string }) => {
  if (type === 'target') {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <text x="20" y="30" fontSize="30" fontWeight="bold" textAnchor="middle" fill={color || "#ef4444"}>T</text>
      </svg>
    );
  }
  if (type === 'distractor1') {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <text x="20" y="30" fontSize="30" fontWeight="bold" textAnchor="middle" fill={color || "#3b82f6"} transform="rotate(180, 20, 20)">L</text>
      </svg>
    );
  }
  if (type === 'distractor2') {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <text x="20" y="30" fontSize="30" fontWeight="bold" textAnchor="middle" fill={color || "#10b981"}>L</text>
      </svg>
    );
  }
  return null;
};

const App = () => {
  const [state, setState] = useState(ExperimentState.SETUP);
  const [participantId, setParticipantId] = useState('');
  const [trials, setTrials] = useState<any[]>([]);
  const [currentTrialIdx, setCurrentTrialIdx] = useState(0);
  const [currentStimuli, setCurrentStimuli] = useState<any[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const startExperiment = () => {
    if (!participantId.trim()) return alert("Please enter a participant number.");
    const newTrials: any[] = [];
    SET_SIZES.forEach(size => {
      for (let i = 0; i < TRIALS_PER_SET; i++) {
        newTrials.push({
          id: newTrials.length,
          setSize: size,
          targetPresent: i < (TRIALS_PER_SET / 2),
          startTime: 0,
        });
      }
    });
    setTrials(newTrials.sort(() => Math.random() - 0.5));
    setState(ExperimentState.INSTRUCTIONS);
  };

  const generateStimuli = useCallback((setSize: number, targetPresent: boolean) => {
    const positions = Array.from({ length: 25 }, (_, i) => i);
    const shuffledPositions = positions.sort(() => Math.random() - 0.5);
    const selectedPositions = shuffledPositions.slice(0, setSize);
    
    return selectedPositions.map((pos, idx) => {
      const x = pos % 5;
      const y = Math.floor(pos / 5);
      const type = (idx === 0 && targetPresent) ? 'target' : (Math.random() > 0.5 ? 'distractor1' : 'distractor2');
      return { type, x, y };
    });
  }, []);

  const nextTrial = useCallback(() => {
    if (currentTrialIdx >= trials.length) {
      setState(ExperimentState.RESULTS);
      return;
    }
    const trial = trials[currentTrialIdx];
    setCurrentStimuli(generateStimuli(trial.setSize, trial.targetPresent));
    setState(ExperimentState.FIXATION);
    
    setTimeout(() => {
      setState(ExperimentState.TRIAL);
      setTrials(prev => {
        const updated = [...prev];
        updated[currentTrialIdx].startTime = Date.now();
        return updated;
      });
    }, 500 + Math.random() * 500);
  }, [currentTrialIdx, trials, generateStimuli]);

  const handleResponse = useCallback((pressed: boolean | null) => {
    if (state !== ExperimentState.TRIAL) return;
    
    const endTime = Date.now();
    const trial = trials[currentTrialIdx];
    const rt = endTime - trial.startTime;
    
    let isCorrect = false;
    let responseStr: string = 'timeout';

    if (pressed !== null) {
      responseStr = pressed ? 'present' : 'absent';
      isCorrect = pressed === trial.targetPresent;
    }

    setTrials(prev => {
      const updated = [...prev];
      updated[currentTrialIdx] = { ...updated[currentTrialIdx], endTime, rt, response: responseStr, isCorrect };
      return updated;
    });

    setFeedbackMessage(pressed === null ? "Too Slow!" : (isCorrect ? "Correct!" : "Incorrect"));
    setState(ExperimentState.FEEDBACK);
    
    setTimeout(() => {
      setFeedbackMessage(null);
      setCurrentTrialIdx(prev => prev + 1);
    }, 800);
  }, [state, currentTrialIdx, trials]);

  useEffect(() => {
    if (state === ExperimentState.TRIAL) {
      const timeout = setTimeout(() => handleResponse(null), TIMEOUT_MS);
      return () => clearTimeout(timeout);
    }
  }, [state, handleResponse]);

  useEffect(() => {
    if (state === ExperimentState.FEEDBACK && feedbackMessage === null) {
      nextTrial();
    }
  }, [state, feedbackMessage, nextTrial]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state === ExperimentState.TRIAL) {
        if (e.key.toLowerCase() === 'j') handleResponse(true);
        if (e.key.toLowerCase() === 'f') handleResponse(false);
      } else if (state === ExperimentState.INSTRUCTIONS && e.code === 'Space') {
        nextTrial();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, handleResponse, nextTrial]);

  const downloadResults = () => {
    const headers = ['Participant', 'Trial', 'SetSize', 'TargetPresent', 'Response', 'RT', 'Correct'];
    const rows = trials.map((t, idx) => [
      participantId, idx + 1, t.setSize, t.targetPresent ? 'Yes' : 'No', t.response, t.rt, t.isCorrect ? '1' : '0'
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `experiment_p${participantId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = useMemo(() => {
    return SET_SIZES.map(size => {
      const sizeTrials = trials.filter(t => t.setSize === size && t.isCorrect);
      const avgRT = sizeTrials.length > 0 
        ? sizeTrials.reduce((acc, curr) => acc + (curr.rt || 0), 0) / sizeTrials.length 
        : 0;
      return { size: `Size ${size}`, rt: Math.round(avgRT) };
    });
  }, [trials]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 font-sans">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-xl overflow-hidden min-h-[600px] flex flex-col border border-gray-100 relative">
        <div className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center z-10">
          <h1 className="text-xl font-bold tracking-tight">Visual Search Lab</h1>
          <div className="flex items-center gap-4">
            {(state === ExperimentState.FIXATION || state === ExperimentState.TRIAL || state === ExperimentState.FEEDBACK) && (
              <span className="text-xs font-medium text-gray-400">Trial {currentTrialIdx + 1} / {trials.length}</span>
            )}
            {participantId && <span className="text-sm bg-gray-700 px-3 py-1 rounded-full border border-gray-600">ID: {participantId}</span>}
          </div>
        </div>

        {state === ExperimentState.SETUP && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <h2 className="text-3xl font-bold mb-4">Participant Setup</h2>
            <p className="text-gray-600 mb-8 max-w-md">Enter the participant's unique ID to begin the session.</p>
            <div className="w-full max-w-xs space-y-4">
              <input type="text" placeholder="ID Number" value={participantId} onChange={(e) => setParticipantId(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none text-center text-lg font-semibold" />
              <button onClick={startExperiment} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg">Begin Session</button>
            </div>
          </div>
        )}

        {state === ExperimentState.INSTRUCTIONS && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Instructions</h2>
            <div className="space-y-6 text-gray-700 text-lg">
              <p>Find the <span className="text-red-600 font-bold">red 'T'</span> as fast as you can.</p>
              <div className="flex justify-center gap-8 bg-gray-50 p-6 rounded-xl border border-gray-100">
                <div className="text-center"><StimulusIcon type="target" /><p className="text-xs font-bold mt-2">TARGET</p></div>
                <div className="text-center opacity-40"><StimulusIcon type="distractor1" /><p className="text-xs font-bold mt-2">DISTRACTOR</p></div>
              </div>
              <ul className="list-disc pl-5 space-y-2">
                <li>Press <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded shadow-sm">J</kbd> if the target is <b>PRESENT</b></li>
                <li>Press <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded shadow-sm">F</kbd> if the target is <b>ABSENT</b></li>
              </ul>
            </div>
            <button onClick={nextTrial} className="mt-10 bg-gray-800 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-900 transition-all">Start (Space)</button>
          </div>
        )}

        {state === ExperimentState.FIXATION && <div className="flex-1 flex items-center justify-center text-6xl font-light text-gray-300">+</div>}

        {state === ExperimentState.TRIAL && (
          <div className="flex-1 flex items-center justify-center bg-gray-50 p-4 relative">
            <div className="grid grid-cols-5 grid-rows-5 gap-4 bg-white p-8 rounded-2xl shadow-inner border border-gray-200">
              {Array.from({ length: 25 }).map((_, i) => {
                const x = i % 5;
                const y = Math.floor(i / 5);
                const stim = currentStimuli.find(s => s.x === x && s.y === y);
                return <div key={i} className="w-12 h-12 flex items-center justify-center">{stim && <StimulusIcon type={stim.type} />}</div>;
              })}
            </div>
            <div className="absolute bottom-10 flex gap-12 text-gray-400 font-medium">
              <div className="text-center"><p className="text-xs mb-1">ABSENT</p><p className="text-2xl font-bold px-4 py-1 bg-white border-2 rounded-lg">F</p></div>
              <div className="text-center"><p className="text-xs mb-1 text-red-400">PRESENT</p><p className="text-2xl font-bold px-4 py-1 bg-white border-2 border-red-100 rounded-lg">J</p></div>
            </div>
          </div>
        )}

        {state === ExperimentState.FEEDBACK && (
          <div className="flex-1 flex flex-col items-center justify-center animate-pulse">
            <h3 className={`text-4xl font-bold ${feedbackMessage === 'Correct!' ? 'text-green-500' : 'text-red-500'}`}>{feedbackMessage}</h3>
          </div>
        )}

        {state === ExperimentState.RESULTS && (
          <div className="flex-1 flex flex-col p-8 overflow-y-auto bg-gray-50">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-gray-800">Results: ID #{participantId}</h2>
              <div className="flex gap-3">
                <button onClick={() => window.location.reload()} className="px-5 py-2 rounded-lg font-medium text-gray-600 hover:bg-gray-200 transition-colors">Restart</button>
                <button onClick={downloadResults} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-all">Download CSV</button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold mb-6">Reaction Time (ms) per Set Size</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="size" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '12px', border: 'none'}} />
                      <Bar dataKey="rt" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold mb-4">Accuracy Statistics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span>Total Correct</span>
                    <span className="font-bold text-green-600">{trials.filter(t => t.isCorrect).length} / {trials.length}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span>Avg. Accuracy</span>
                    <span className="font-bold">{Math.round((trials.filter(t => t.isCorrect).length / trials.length) * 100)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-0 left-0 w-full h-1 bg-gray-100">
          <div className="h-full bg-blue-500 transition-all duration-300" 
            style={{ width: `${state === ExperimentState.RESULTS ? 100 : ((currentTrialIdx) / trials.length) * 100}%` }}></div>
        </div>
      </div>
    </div>
  );
};

export default App;
