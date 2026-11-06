import { Link } from "react-router-dom";

function Footer() {
  return (
    <footer className="footer">
      <Link to="/">OpenDSA</Link>
      <Link to="/about">About</Link>
      <Link to="/official">Official</Link>
      <Link to="/contact">Contact</Link>
    </footer>
  );
}

export default Footer;