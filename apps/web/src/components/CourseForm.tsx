import { authFetch } from "../auth/Auth";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

interface Book { id: number; title: string }
interface Organization { id: number; name: string }
interface Course { id: number; name: string; number: string; organization_id: number }
interface Term { id: number; season: number; year: number }
interface LmsInstance { id: number; url: string; organization_id: number | null }
const seasons: Record<number, string> = { 100: "Spring", 200: "Summer I", 300: "Summer II", 400: "Fall", 500: "Winter" };

async function loadOptions<T>(path: string, signal: AbortSignal): Promise<T[]> {
    const response = await fetch(`/api/${path}`, { signal });
    if (!response.ok) throw new Error("Unable to load form options. Please reload.");
    const body = await response.json();
    return body.data;
}

function CourseForm() {
    const [bookInstance, setBookInstance] = useState("");
    const [books, setBooks] = useState<Book[]>([]);
    const [organization, setOrganization] = useState("");
    const [course, setCourse] = useState("");
    const [term, setTerm] = useState("");
    const [label, setLabel] = useState("");
    const [lmsInstance, setLmsInstance] = useState("");
    const [lmsCourseId, setLmsCourseId] = useState("");
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [terms, setTerms] = useState<Term[]>([]);
    const [lmsInstances, setLmsInstances] = useState<LmsInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const inFlight = useRef(false);
    const [error, setError] = useState("");
    const [optionsError, setOptionsError] = useState("");
    const [coursesError, setCoursesError] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setOptionsError("");
        Promise.all([
            loadOptions<Book>("book-instances", controller.signal),
            loadOptions<Organization>("organizations", controller.signal),
            loadOptions<Term>("terms", controller.signal),
            loadOptions<LmsInstance>("lms-instances", controller.signal),
        ]).then(([bookOptions, orgs, academicTerms, instances]) => {
            if (controller.signal.aborted) return;
            setBooks(bookOptions);
            setOrganizations(orgs);
            setTerms(academicTerms);
            setLmsInstances(instances);
        }).catch(() => {
            if (!controller.signal.aborted) setOptionsError("Unable to load form options. Please reload.");
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setCourses([]);
        setCoursesError("");
        if (!organization) { setCoursesLoading(false); return () => controller.abort(); }
        setCoursesLoading(true);
        loadOptions<Course>(`courses?organization_id=${organization}`, controller.signal)
            .then(data => { if (!controller.signal.aborted) setCourses(data); })
            .catch(() => { if (!controller.signal.aborted) setCoursesError("Unable to load courses. Please reload."); })
            .finally(() => { if (!controller.signal.aborted) setCoursesLoading(false); });
        return () => controller.abort();
    }, [organization]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (inFlight.current) return;
        setError("");
        if (!bookInstance || !organization || !course || !term || !label.trim() || !lmsInstance || !lmsCourseId.trim()) {
            setError("Complete all required fields.");
            return;
        }
        if (!courses.some(item => item.id === Number(course) && item.organization_id === Number(organization))) {
            setError("Select a course belonging to the selected organization.");
            return;
        }
        inFlight.current = true;
        setSubmitting(true);
        try {
            const payload = JSON.stringify({
                organization_id: Number(organization), course_id: Number(course), term_id: Number(term),
                label: label.trim(), lms_instance_id: Number(lmsInstance), lms_course_num: lmsCourseId.trim(),
                book_instance_id: Number(bookInstance),
            });
            const response = await authFetch("/api/course-offerings", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: payload,
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || "Unable to create the course offering.");
            window.location.assign(body.url);

        } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to create the course offering.");
        } finally {
            inFlight.current = false;
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <fieldset disabled={loading || submitting} style={{ border: 0, padding: 0, margin: 0 }}>
                <div>
                    <label htmlFor="organization">Organization: </label>
                    <select id="organization" name="organization" required value={organization} onChange={event => {
                        setOrganization(event.target.value); setCourse(""); setLmsInstance("");
                    }}>
                        <option value="">Select</option>
                        {organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    {(error || optionsError || coursesError) && <p>{error || optionsError || coursesError}</p>}
                </div>
                <div>
                    <label htmlFor="course">Course: </label>
                    <select id="course" name="course" required value={course} disabled={!organization || coursesLoading}
                        onChange={event => setCourse(event.target.value)}>
                        <option value="">Select</option>
                        {courses.map(item => <option key={item.id} value={item.id}>{item.number}: {item.name}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="term">Term: </label>
                    <select id="term" name="term" required value={term} onChange={event => setTerm(event.target.value)}>
                        <option value="">Select</option>
                        {terms.map(item => <option key={item.id} value={item.id}>{seasons[item.season] || item.season} {item.year}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="label">Label: </label>
                    <input id="label" name="label" required maxLength={255} placeholder="e.g. TR 10:00am"
                        value={label} onChange={event => setLabel(event.target.value)} />
                    <p>Write a label for each course section.</p>
                </div>
                <div>
                    <label htmlFor="bookInstance">Book Instance: </label>
                    <select id="bookInstance" name="bookInstance" required value={bookInstance}
                        onChange={event => setBookInstance(event.target.value)}>
                        <option value="">Select</option>
                        {books.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="lmsInstance">LMS Instance: </label>
                    <select id="lmsInstance" name="lmsInstance" required value={lmsInstance} disabled={!organization}
                        onChange={event => setLmsInstance(event.target.value)}>
                        <option value="">Select</option>
                        {lmsInstances.filter(item => item.organization_id === null || item.organization_id === Number(organization))
                            .map(item => <option key={item.id} value={item.id}>{item.url}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="lmsAccessToken">LMS Access Token: </label>
                    <input type="password" id="lmsAccessToken" name="lmsAccessToken" disabled />
                </div>
                <div>
                    <label htmlFor="lmsCourseId">LMS Course ID: </label>
                    <input id="lmsCourseId" name="lmsCourseId" required maxLength={255} value={lmsCourseId}
                        onChange={event => setLmsCourseId(event.target.value)} />
                    <p>
                        Create a new course at the selected LMS instance and copy the course Id here
                        (e.g. Course Id of https://canvas.instructure.com/courses/1076903 is 1076903).
                    </p>
                </div>
                <button type="submit" disabled={coursesLoading || !!optionsError || !!coursesError}>
                    Create New Course Offering
                </button>
            </fieldset>
        </form>
    );
}

export default CourseForm;
