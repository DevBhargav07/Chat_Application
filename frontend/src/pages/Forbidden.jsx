import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="forbidden-page">
      <ShieldAlert size={56} className="forbidden-icon" />
      <h1>403</h1>
      <p>You don't have permission to view this page. Contact your administrator if you believe this is a mistake.</p>
      <Link to="/dashboard" className="notfound-link">
        <ArrowLeft size={15} />
        Back to Dashboard
      </Link>
    </div>
  );
}