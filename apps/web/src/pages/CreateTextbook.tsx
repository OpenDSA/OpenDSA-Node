/*
 * AI Assistance Disclosure:
 * I used AI (ChatGPT) to help develop the CreateTextbook component.
 * AI assisted with organizing the form using React state, reducing
 * repetitive JSX through mapping, and implementing basic form validation.
 * The form currently uses placeholder data and does not connect to
 * the backend.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

const dropdowns = [
  {
    name: "organization",
    label: "Organization",
    options: ["Virginia Tech"],
  },
  {
    name: "course",
    label: "Course",
    options: ["CS3114", "CS1114"],
  },
  {
    name: "term",
    label: "Term",
    options: ["Fall 2026", "Spring 2027"],
  },
  {
    name: "bookInstance",
    label: "Book Instance",
    options: [
      "CS3 Data Structures & Algorithms",
      "Introduction to Software Design",
    ],
  },
] as const;

function CreateTextbook() {
  const [form, setForm] = useState({
    organization: "",
    course: "",
    term: "",
    label: "",
    bookInstance: "",
  });

  function updateField(name: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    alert("Textbook creation is not yet available.");
  }

  return (
    <div className="textbook-page">
      <h1>New Textbook</h1>

      <div className="textbook-container">
        <p>
          View the <Link to="/instructor-guides">instructor's guide</Link> for
          more information.
        </p>

        <p className="textbook-required">All fields are required</p>

        <form onSubmit={handleSubmit}>
          {dropdowns.slice(0, 3).map((field) => (
            <div className="textbook-field" key={field.name}>
              <label htmlFor={field.name}>{field.label}:</label>
              <select
                id={field.name}
                value={form[field.name]}
                onChange={(e) => updateField(field.name, e.target.value)}
                required
              >
                <option value="">Select</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
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
              >
                <option value="">Select</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="textbook-submit">
            <button type="submit" className="primary-button">
              Create Non LMS Textbook
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTextbook;