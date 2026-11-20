import React, { useRef } from "react";
import { Link } from "react-router-dom";

interface Props {
  offering: { label: string; course: { number: string; name: string }; term: { slug: string }; inst_books: { id: number; title: string }[] };
  generating: boolean;
  bookUrl: string;
  error: string;
  onCompile: () => void;
}
export default function StandaloneCompilation({ offering, generating, bookUrl, error, onCompile }: Props) {
  const info = useRef<HTMLDialogElement>(null);
  const complete = !!bookUrl && !generating;
  const term = offering.term.slug.replace(/-/g, " ").replace(/\b[a-z]/g, value => value.toUpperCase());
  return <section className="standalone-compilation">
    <nav className="standalone-breadcrumb" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span>
      <Link to="/courses">Courses</Link><span>/</span><span aria-current="page">{offering.course.number} / {term}</span></nav>
    <h1>{offering.course.number}: {offering.course.name} <small>{term}</small></h1>
    <p className="standalone-offering">{offering.label}</p>
    <div className="standalone-status">
      <p role="status">{generating ? "Compiling textbook…" : error ? "Compilation failed. You can retry." : complete ? "Book generated successfully." : "Ready to compile textbook."}</p>
      <div className={`standalone-progress${generating ? " is-running" : ""}`} role="progressbar" aria-label="Textbook compilation"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={generating ? undefined : complete ? 100 : 0}
        aria-valuetext={generating ? "Compilation in progress" : complete ? "Complete" : "Not compiled"}>
        <div className="standalone-progress-fill" style={{ width: generating || complete ? "100%" : "0%" }} />
        {!generating && <span>{complete ? "100%" : "0%"}</span>}
      </div>
      {error && <p role="alert" className="standalone-error">{error}</p>}
    </div>
    <div className="standalone-table-scroll"><table className="standalone-book-table"><thead><tr>
      <th scope="col">Book Title</th><th scope="col">Textbook</th><th scope="col">Actions</th>
    </tr></thead><tbody>{offering.inst_books.map(book => <tr key={book.id}>
      <td>{book.title}</td><td>{bookUrl ? <a href={bookUrl}>Textbook URL</a> : <span>Not compiled</span>}</td>
      <td><div className="standalone-actions"><button type="button" className="standalone-info" aria-label="About standalone compilation"
        aria-haspopup="dialog" onClick={() => info.current?.showModal()}>ⓘ</button>
        <button type="button" className="standalone-compile" disabled={generating || offering.inst_books.length !== 1} onClick={onCompile}>
          {generating ? "Compiling…" : bookUrl ? "Recompile Book" : "Compile Textbook"}
        </button></div></td>
    </tr>)}</tbody></table></div>
    {offering.inst_books.length === 0 && <p>No book is linked to this textbook offering.</p>}
    <dialog ref={info} className="standalone-info-dialog" aria-labelledby="standalone-info-title">
      <h2 id="standalone-info-title">Standalone compilation</h2>
      <p>When you click this button the OpenDSA book will be generated as an independent resource. This book will have no LMS ties such as Canvas integration.</p>
      <form method="dialog"><button type="submit" className="standalone-compile">Close</button></form>
    </dialog>
  </section>;
}
