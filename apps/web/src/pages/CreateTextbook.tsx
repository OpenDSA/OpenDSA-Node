/*
 * AI Assistance Disclosure:
 * I used AI (ChatGPT) to help develop the CreateTextbook component.
 * AI assisted with organizing the form using React state, reducing
 * repetitive JSX through mapping, and implementing basic form validation.
 */

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authFetch } from "../auth/Auth";

interface Option { id: number; label: string }
interface Course { id: number; number: string; name: string; organization_id: number }
const seasons: Record<number, string> = { 100: "Spring", 200: "Summer I", 300: "Summer II", 400: "Fall", 500: "Winter" };

function CreateTextbook() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<{ organization: Option[]; term: Option[]; bookInstance: Option[] }>({
    organization: [], term: [], bookInstance: [],
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const [form, setForm] = useState({
    organization: "",
    course: "",
    term: "",
    label: "",
    bookInstance: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    async function load(path: string) {
      const response = await fetch(`/api/${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load form options. Please reload.");
      return (await response.json()).data;
    }
    Promise.all([load("organizations"), load("courses"), load("terms"), load("book-instances")])
      .then(([organizations, courseOptions, terms, books]) => {
        if (controller.signal.aborted) return;
        setOptions({
          organization: organizations.map((item: { id: number; name: string }) => ({ id: item.id, label: item.name })),
          term: terms.map((item: { id: number; season: number; year: number }) => ({
            id: item.id, label: `${seasons[item.season] || item.season} ${item.year}`,
          })),
          bookInstance: books.map((item: { id: number; title: string }) => ({ id: item.id, label: item.title })),
        });
        setCourses(courseOptions);
      }).catch(() => {
        if (!controller.signal.aborted) setOptionsError("Unable to load form options. Please reload.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const availableCourses = courses.filter(item => item.organization_id === Number(form.organization));
  const dropdowns = [
    { name: "organization", label: "Organization", options: options.organization },
    { name: "course", label: "Course", options: availableCourses.map(item => ({ id: item.id, label: `${item.number}: ${item.name}` })) },
    { name: "term", label: "Term", options: options.term },
    { name: "bookInstance", label: "Book Instance", options: options.bookInstance },
  ] as const;

  function updateField(name: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [name]: value, ...(name === "organization" ? { course: "" } : {}) }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || loading || optionsError) return;
    setError("");
    if (!availableCourses.some(item => item.id === Number(form.course)) || !form.term || !form.bookInstance || !form.label.trim()) {
      setError("Complete all required fields and select a course belonging to the organization."); return;
    }
    inFlight.current = true; setSubmitting(true);
    try {
      const response = await authFetch("/api/textbooks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: Number(form.organization), course_id: Number(form.course),
          term_id: Number(form.term), label: form.label.trim(), book_instance_id: Number(form.bookInstance) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create the textbook.");
      navigate(body.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to create the textbook."); }
    finally { inFlight.current = false; setSubmitting(false); }
  }

  return (
    <div className="textbook-page">
      <h1>New Textbook</h1>

      <div className="textbook-container">
        <p>
          View the <Link to="/guides">instructor's guide</Link> for
          more information.
        </p>

        <p className="textbook-required">All fields are required</p>
        {(optionsError || error) && <p role="alert">{optionsError || error}</p>}

        <form onSubmit={handleSubmit}>
          {dropdowns.slice(0, 3).map((field) => (
            <div className="textbook-field" key={field.name}>
              <label htmlFor={field.name}>{field.label}:</label>
              <select
                id={field.name}
                value={form[field.name]}
                onChange={(e) => updateField(field.name, e.target.value)}
                required
                disabled={loading || submitting || (field.name === "course" && !form.organization)}
              >
                <option value="">Select</option>
                {field.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="textbook-field">
            <label htmlFor="label">Label:</label>
            <div>
              <input
                id="label"
                placeholder="e.g. TR 10:00am"
                value={form.label}
                onChange={(e) => updateField("label", e.target.value)}
                required
                maxLength={255}
                disabled={loading || submitting}
              />
              <small>Write a label for each course section.</small>
            </div>
          </div>

          {dropdowns.slice(3).map((field) => (
            <div className="textbook-field" key={field.name}>
              <label htmlFor={field.name}>{field.label}:</label>
              <select
                id={field.name}
                value={form[field.name]}
                onChange={(e) => updateField(field.name, e.target.value)}
                required
                disabled={loading || submitting}
              >
                <option value="">Select</option>
                {field.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="textbook-submit">
            <button type="submit" className="primary-button" disabled={loading || submitting || !!optionsError}>
              Create Non LMS Textbook
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTextbook;
