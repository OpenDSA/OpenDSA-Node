import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="home-grid">
      <section className="home-column">
        <h2>What Is OpenDSA?</h2>
        <p>
          OpenDSA is infrastructure and materials to support courses in a wide
          variety of Computer Science-related topics such as Data Structures
          and Algorithms (DSA), Formal Languages, Finite Automata, and
          Programming Languages.
        </p>
        <p>
          OpenDSA materials include many visualizations and interactive
          exercises. Our philosophy is that students learn best when they
          engage the material and then practice it until they have demonstrated
          their proficiency. OpenDSA provides a place for students to practice
          skills and develop knowledge with a variety of exercises including
          small code writing problems, proficiency exercises where students
          demonstrate knowledge of an algorithm by interacting with a data
          structure, and questions about knowledge. For more information,
          look <Link to="/about">HERE</Link>.
        </p>
      </section>
      <section className="home-column">
        <img
          src="/images/heapsort.png"
          alt="OpenDSA heapsort visualization"
          className="home-image"
        />
      </section>
      <section className="home-column">
        <h2>Do I Have to Be Enrolled?</h2>
        <p>
          No, you do not have to be a student enrolled in a course to use
          OpenDSA. OpenDSA provides comprehensive support for teachers who
          want to use our materials for their textbook or homeworks. But we
          also support independent learners who are just practicing on their
          own. See our sample books list, where you can practice any exercises
          or view any materials that you wish.
        </p>
      </section>
      {/* Second Row */}
      <section className="home-column">
        <img
          src="/images/huffman.png"
          alt="OpenDSA Huffman Coding Tree visualization"
          className="home-image"
        />
      </section>
      <section className="home-column">
        <h2>Use in a Course</h2>
        <p>
          For teachers, OpenDSA allows you to create your own custom
          eTextbooks, selecting from our comprehensive body of materials
          and exercises. Use OpenDSA as supplementary reading material,
          or use it as your primary textbook and homeworks.
          See <Link to="/guides">MORE INFORMATION</Link>.
        </p>
      </section>
      <section className="home-column">
        <img
          src="/images/shellsort.png"
          alt="OpenDSA Shellsort Performance visualization"
          className="home-image"
        />
      </section>
    </div>
  );
}

export default Home;