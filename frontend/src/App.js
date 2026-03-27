import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import OpsCommand from "./components/OpsCommand";
import "./App.css";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function App() {
  const [kState, setKState] = useState(null);
  const [ticker, setTicker] = useState({ total_diverted: 0, revenue_saved: 0, refresh_count: 0 });
  const streamRef = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, tickRes] = await Promise.all([
        axios.get(`${API}/kernel/state`),
        axios.post(`${API}/kernel/tick`),
      ]);
      setKState(stateRes.data);
      setTicker(tickRes.data);
    } catch (e) {
      console.error("SITI backend fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchState();
    streamRef.current = setInterval(fetchState, 8000);
    return () => clearInterval(streamRef.current);
  }, [fetchState]);

  return <OpsCommand kState={kState} ticker={ticker} />;
}

export default App;
