import { useState } from "react";

function CourseForm()
{
    const [organization, setOrganization] = useState("");
    const [course, setCourse] = useState("");
    const [term, setTerm] = useState("");
    const [label, setLabel] = useState("");
    const [bookInstance, setBookInstance] = useState("");
    const [lmsInstance, setLmsInstance] = useState("");
    const [lmsAccessToken, setLmsAccessToken] = useState("");
    const [lmsCourseId, setLmsCourseId] = useState("");
    const [error, setError] = useState("");

    function handleSubmit(event: React.FormEvent)
    {
        event.preventDefault();

        if (organization === "") 
        {
            setError("Organization is required");
            return;
        }

        if (course === "")
        {
            console.log("Course is required");
            return;
        }

        if (term === "")
        {
            console.log("Term is required");
            return;
        }

        if (label === "")
        {
            console.log("Label is required");
            return;
        }

        if (bookInstance === "")
        {
            console.log("Book Instance is required");
            return;
        }

        if (lmsInstance === "")
        {
            console.log("LMS Instance is required");
            return;
        }

        if (lmsAccessToken === "")
        {
            console.log("LMS Access Token is required");
            return;
        }

        if (lmsCourseId === "")
        {
            console.log("LMS Course ID is required");
            return;
        }

        console.log("Form Submitted!")
    }

    return (
        <form onSubmit={handleSubmit}>
            <div>
                <label htmlFor="organization">Organization: </label>
                <select 
                id = "organization" 
                name = "organization" 
                value = {organization} 
                onChange={(event) => setOrganization(event.target.value)}>
                    <option value = "">Select</option>
                    <option value="Virginia Tech">Virginia Tech</option>
                </select>
                {error && <p>{error}</p>}
            </div>

            <div>
                <label htmlFor="course">Course: </label>
                <select 
                id = "course" 
                name = "course"
                value = {course} 
                onChange={(event) => setCourse(event.target.value)}>
                    <option value = "">Select</option>
                    <option value="CS3114: Data Structures & Algorithms">CS3114: Data Structures & Algorithms</option>
                </select>
            </div>

            <div>
                <label htmlFor="term">Term: </label>
                <select 
                id = "term" 
                name = "term"
                value = {term} 
                onChange={(event) => setTerm(event.target.value)}>
                    <option value = "">Select</option>
                    <option value="F26">F26</option>
                </select>
            </div>

            <div>
                <label htmlFor="label">Label: </label>
                <input 
                type = "text" 
                id = "label" 
                name = "label" 
                placeholder = "e.g. TR 10:00am" 
                value = {label}
                onChange={(event) => setLabel(event.target.value)}/>
                <p>Write a label for each course section.</p>
            </div>

            <div>
                <label htmlFor="bookInstance">Book Instance: </label>
                <select 
                id = "bookInstance" 
                name = "bookInstance"
                value = {bookInstance}
                onChange={(event) => setBookInstance(event.target.value)}>
                    <option value = "">Select</option>
                    <option value="CS3">CS3 Data Structures & Algorithms</option>
                </select>
            </div>

            <div>
                <label htmlFor="lmsInstance">LMS Instance: </label>
                <select
                id = "lmsInstance"
                name = "lmsInstance"
                value = {lmsInstance}
                onChange={(event) => setLmsInstance(event.target.value)}>
                    <option value = "">Select</option>
                    <option value="https://lti.cs.vt.edu">https://lti.cs.vt.edu</option>
                </select>
            </div>

            <div>
                <label htmlFor="lmsAccessToken">LMS Access Token: </label>
                <input
                type = "text"
                id = "lmsAccessToken"
                name = "lmsAccessToken"
                value = {lmsAccessToken}
                onChange={(event) => setLmsAccessToken(event.target.value)}/>
            </div>

            <div>
                <label htmlFor="lmsCourseId">LMS Course ID: </label>
                <input 
                type = "text" 
                id = "lmsCourseId" 
                name = "lmsCourseId"
                value = {lmsCourseId}
                onChange={(event) => setLmsCourseId(event.target.value)}/>
                <p>
                    Create a new course at the selected LMS instance and copy the course Id here 
                    (e.g. Course Id of https://canvas.instructure.com/courses/1076903 is 1076903).
                </p>
            </div>

            <button type = "submit">
                Create New Course Offering
            </button>

        </form>
    );
}

export default CourseForm;