import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import Dashboard from "./components/Dashboard";
import "./App.css";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function App() {
  const [kState, setKState]     = useState(null);
  const [ticker, setTicker]     = useState({ total_diverted: 0, revenue_saved: 0, refresh_count: 0 });
  const [loading, setLoading]   = useState(true);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isStreaming, setIsStreaming]     = useState(false);
  const streamRef = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, tickRes] = await Promise.all([
        axios.get(`${API}/kernel/state`),
        axios.post(`${API}/kernel/tick`),
      ]);
      setKState(stateRes.data);
      setTicker(tickRes.data);
      setLoading(false);
    } catch (e) {
      console.error("MIMI Kernel fetch error:", e);
      setLoading(false);
    }
  }, []);

  /* Live-stream: push 100 virtual units every 10 s */
  const startLiveStream = useCallback(async () => {
    setIsStreaming(true);
    const push = async () => {
      try {
        await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/kernel/stream-batch?n=100`);
        await fetchState();
      } catch (e) {
        console.error("Stream batch error:", e);
      }
    };
    await push();
    streamRef.current = setInterval(push, 10000);
  }, [fetchState]);

  const stopLiveStream = useCallback(() => {
    setIsStreaming(false);
    if (streamRef.current) {
      clearInterval(streamRef.current);
      streamRef.current = null;
    }
  }, []);

  /* Periodic 4-second kernel state refresh */
  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 4000);
    return () => clearInterval(id);
  }, [fetchState]);

  /* Cleanup stream on unmount */
  useEffect(() => () => { if (streamRef.current) clearInterval(streamRef.current); }, []);

  return (
    <div className="App">
      <Dashboard
        kState={kState}
        ticker={ticker}
        loading={loading}
        apiBase={API}
        onRefresh={fetchState}
        isCalibrating={isCalibrating}
        setCalibrating={setIsCalibrating}
        isStreaming={isStreaming}
        onStreamStart={startLiveStream}
        onStreamStop={stopLiveStream}
      />
    </div>
  );
}

export default App;
