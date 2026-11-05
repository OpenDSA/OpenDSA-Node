function InstructorGuides() {
  return (
    <div>
      <h1>Instructor Guides</h1>
      <p>These guides will help instructors to set up an OpenDSA eTextbook instance for 
        use within a Canvas course, and/or add individual exercises and visualizations 
        to their Canvas, Moodle, or Blackboard course. If your institution has its own Canvas 
        installation, then you can attach an OpenDSA eTextbook to any course where you have 
        instructor permissions. If you don't have access to Canvas at your institution, then 
        you can create a Canvas course at the public Canvas site,{" "}
          <a
            href="https://canvas.instructure.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://canvas.instructure.com
          </a>
        </p>
        <p>

        Note: If you are an OpenDSA developer, then you probably want to
        set up your own test installation following the directions at{" "}

        <a
          href="https://github.com/OpenDSA/OpenDSA-DevStack"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://github.com/OpenDSA/OpenDSA-DevStack
        </a>
        . Pretty much you just need to install Docker, and then load
        everything up to have a complete system.
      </p>

      <p>
        Note 2: Instructors should not use the Canvas "clone course"
        feature as a way to copy an existing course with OpenDSA
        materials. The process described here for creating a course with
        an OpenDSA textbook sets up course-specific links that cannot be
        cloned. If you want to clone the course for reasons other than to
        duplicate the OpenDSA textbook, you can still do that. Just delete
        all of the OpenDSA modules and Assignments, and then use the
        directions here to create the new eTextbook materials in the new
        course shell.
      </p>

      <p>
        Note 3: Be aware that what you see as an instructor in an OpenDSA
        module page is not the same as what a student sees. In particular,
        the instructor view has an extra column that makes content on the
        module page go outside of the Canvas page boundary. Fortunately,
        students do not have this problem. You can see what students see
        if you try looking at the material using "student view".
      </p>
    </div>
  );
}

export default InstructorGuides;