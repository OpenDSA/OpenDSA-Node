import { useState } from "react";
import { useAuth } from "../auth/Auth";
import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const { user, logout } = useAuth(); const navigate = useNavigate();
  const [error, setError] = useState("");
  async function signOut() {
    try { await logout(); setError(""); navigate("/login"); }
    catch { setError("Sign out failed. Please retry."); }
  }
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-logo">OpenDSA</Link>

        <div className="dropdown">
            <button 
                type="button"
                className="dropdown-button"
                aria-haspopup="true">
                    Course ▼
            </button>
            
            <div className="dropdown-menu">
                {/* <Link to="/courses">Browse All Courses</Link> */} 
                <Link to="/courses/new">Create New Course</Link>
                <Link to="/textbooks/new">Create New Textbook</Link>
                </div>
            </div>

            {/* <Link to="/books/new">Create Book</Link> */}
            <Link to="/guides">Instructor Guides</Link>

        <div className="dropdown">
          <button
              type = "button"
              className = "dropdown-button"
              aria-haspopup = "true">
                  System Documentation ▼
          </button>
          <div className="dropdown-menu">
            <a
              href = "https://opendsa.readthedocs.io/en/latest/"
              target="_blank"
              rel= "noopener noreferrer"
            >
              OpenDSA Official documentation
            </a>
            <a
              href= "/documents/HECVAT3.xlsx"
              download
            >
              HECVAT3
            </a>
          </div>
        </div>
        </div>

        <div className="navbar-right">
          {user && (
            <Link 
              to="/admin" 
              className="admin-link"
              aria-label="Administrator Dashboard" 
              title="Administrator Dashboard">
            🔧
            </Link>
          )}
            {user ? <><span>{user.first_name || user.email}</span><button type="button" onClick={signOut}>Sign out</button></>
              : <Link to="/login">Sign in</Link>}
            {error && <span role="alert">{error}</span>}
      </div>
    </nav>
  );
}

export default Navbar;