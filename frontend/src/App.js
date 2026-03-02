import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Dashboard from "./components/Dashboard";
import "./App.css";

const API = "/api";

function App() {
  const [kState, setKState] = useState(null);
  const [ticker, setTicker] = useState({ total_diverted: 0, revenue_saved: 0, refresh_count: 0 });
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const [stateRes, tickRes] = await Promise.all([
        axios.get("/api/kernel/state"),
        axios.post("/api/kernel/tick")
      ]);
      setKState(stateRes.data);
      setTicker(tickRes.data);
      setLoading(false);
    } catch (e) {
      console.error("MIMI Kernel fetch error:", e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 4000);
    return () => clearInterval(interval);
  }, [fetchState]);

  return (
    <div className="App">
      <Dashboard
        kState={kState}
        ticker={ticker}
        loading={loading}
        apiBase={API}
        onRefresh={fetchState}
      />
    </div>
  );
}

export default App;
