import { Dashboard } from "./pages/Dashboard";
import { SharedView } from "./pages/SharedView";

const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);

export default function App() {
  if (shareMatch) {
    return <SharedView token={decodeURIComponent(shareMatch[1])} />;
  }
  return <Dashboard />;
}
