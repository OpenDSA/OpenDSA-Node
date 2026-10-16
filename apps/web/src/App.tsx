import { useEffect, useState } from "react";
import CreateCourse from "./pages/CreateCourse";

function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <div>
      <h1>OpenDSA</h1>
      <p>Backend status: {status}</p>

      <CreateCourse />
    </div>
  );
}

export default App;
