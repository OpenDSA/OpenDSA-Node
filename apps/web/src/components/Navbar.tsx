import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-logo">OpenDSA</Link>
        <span>Course ▼</span>

        <div className="dropdown">
            <button 
                type="button"
                className="dropdown-button"
                aria-haspopup="true">
                    Course ▼
            </button>
            
            <div className="dropdown-menu">
                <Link to="/courses">Browse All Courses</Link>
                <Link to="/courses/new">Create New Course</Link>
                <Link to="/books/new">Create New Textbook</Link>
                </div>
            </div>

            <Link to="/books/new">Create Book</Link>
            <Link to="/guides">Instructor Guides</Link>
            <Link to="/documentation">System Documentation</Link>
        </div>

        <div className="navbar-right">
            <span aria-label="Admin Settings" title="Admin Settings">⚙</span>
            <span>Account</span>
      </div>
    </nav>
  );
}

export default Navbar;