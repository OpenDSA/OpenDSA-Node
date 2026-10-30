import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

interface Offering {
  id: number; label: string; lms_course_num: string;
  course: { number: string; name: string }; term: { slug: string };
  lms_instance: { url: string }; inst_books: { id: number; title: string }[];
}

export default function CourseOffering() {
  const { id: offeringId } = useParams();
  const id = Number(offeringId);
  const [offering, setOffering] = useState<Offering | null>(null);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [bookUrl, setBookUrl] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/course-offerings/${id}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setOffering(body.data);
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id]);

  async function generate() {
    if (inFlight.current || !window.confirm("Generate this book's modules and assignments in the Canvas course shown?")) return;
    inFlight.current = true; setGenerating(true); setError(""); setBookUrl("");
    try {
      const response = await fetch(`/api/course-offerings/${id}/generate`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setBookUrl(body.data.book_url);
    } catch (error) { setError(error instanceof Error ? error.message : "Generation failed."); }
    finally { inFlight.current = false; setGenerating(false); }
  }

  return <div>
    <h1>Course Offering</h1>
    {error && <p role="alert">{error}</p>}
    {offering ? <>
      <p>{offering.course.number}: {offering.course.name} — {offering.label}</p>
      <p>Term: {offering.term.slug}</p>
      <p>Canvas course: {offering.lms_instance.url}/courses/{offering.lms_course_num}</p>
      {offering.inst_books.map(book => <p key={book.id}>Book: {book.title}</p>)}
      <button type="button" disabled={generating || offering.inst_books.length !== 1} onClick={generate}>
        Generate Canvas Course
      </button>
      {generating && <p role="status">Generating…</p>}
      {bookUrl && <p role="status">Generation succeeded. <a href={bookUrl}>Open compiled book</a></p>}
    </> : !error && <p>Loading…</p>}
  </div>;
}
