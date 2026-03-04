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
  const [isGhostMode, setIsGhostMode]    = useState(false);
  const streamRef     = useRef(null);
  const ghostRef      = useRef(null);
  const ghostCountRef = useRef(0);

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

  /* ── Normal Live Stream: 100 units / 10s ─────────────── */
  const startLiveStream = useCallback(async () => {
    setIsStreaming(true);
    const push = async () => {
      try {
        await axios.post(`${API}/kernel/stream-batch?n=100`);
        await fetchState();
      } catch (e) { console.error("Stream error:", e); }
    };
    await push();
    streamRef.current = setInterval(push, 10000);
  }, [fetchState]);

  const stopLiveStream = useCallback(() => {
    setIsStreaming(false);
    if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; }
  }, []);

  /* ── Ghost Trigger: 50 units / 1s, auto-stops at 90s ─── */
  const startGhostMode = useCallback(async () => {
    // Halt normal stream if running
    if (streamRef.current) { clearInterval(streamRef.current); streamRef.current = null; setIsStreaming(false); }
    setIsGhostMode(true);
    ghostCountRef.current = 0;
    const push = async () => {
      ghostCountRef.current += 1;
      if (ghostCountRef.current > 90) {
        setIsGhostMode(false);
        if (ghostRef.current) { clearInterval(ghostRef.current); ghostRef.current = null; }
        return;
      }
      try {
        await axios.post(`${API}/kernel/stream-batch?n=50`);
        await fetchState();
      } catch (e) { console.error("Ghost trigger error:", e); }
    };
    await push();
    ghostRef.current = setInterval(push, 1000);
  }, [fetchState]);

  const stopGhostMode = useCallback(() => {
    setIsGhostMode(false);
    ghostCountRef.current = 0;
    if (ghostRef.current) { clearInterval(ghostRef.current); ghostRef.current = null; }
  }, []);

  /* ── Periodic 4-second state refresh ─────────────────── */
  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 4000);
    return () => clearInterval(id);
  }, [fetchState]);

  /* ── Cleanup on unmount ───────────────────────────────── */
  useEffect(() => () => {
    if (streamRef.current) clearInterval(streamRef.current);
    if (ghostRef.current)  clearInterval(ghostRef.current);
  }, []);

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
        isGhostMode={isGhostMode}
        onGhostStart={startGhostMode}
        onGhostStop={stopGhostMode}
      />
    </div>
  );
}

export default App;
