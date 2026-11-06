function About() {
    return (
        <div>
            <h1>About OpenDSA: Open Source Interactive Computer Science Instruction</h1>
            {/*
                <p>[Click on any of the images to try things out!]</p>
            */}
            <p>Welcome to the homepage for the OpenDSA Active-eBook Project. We have created 
                infrastructure and materials to support courses in a wide variety of Computer 
                Science-related topics such as Data Structures and Algorithms (DSA), Formal 
                Languages, Finite Automata, and Programming Languages.
            </p>
            
            <p>
                OpenDSA materials include many visualizations and interactive exercises. Our 
                philosophy is that students learn this material best when they engage the material 
                and then practice it until they have demonstrated their proficiency. This page shows 
                a sampling of screenshots (if you click on a screenshot, you will be taken to the actual 
                artifact). In the same way, a given visualization or exercise could be incorporated individually 
                into an instructor's own web pages.
            </p>

            <p>
                But these visualizations and exercises were designed to be integrated with explanatory tutorials, 
                with the basic unit of instruction being a "module". A module is a single HTML page, corresponding 
                to a single section in a textbook, or a single topic that might be part of a lecture. Modules are 
                collected together to form an OpenDSA "book instance". Book instances can be integrated into courses 
                in the Canvas LMS.
            </p>

            <ul>
                <li>
                    <a href = "https://opendsax.cs.vt.edu/OpenDSA/Books/CS2/html/" target = "_blank" rel = "noopener norefferer">Here</a> is 
                    an example book instance for the data structures component of a typical CS2-level course.
                </li>
                <li>
                    <a href="https://opendsax.cs.vt.edu/OpenDSA/Books/CS3/html/" target = "_blank" rel = "noopener noreferrer">Here</a> is 
                    an example book instance for a typical Data Structures and Algorithms course taken after a traditional CS2 course. 
                    (that we refer to as "CS3").
                </li>
                <li>
                    <a href = "https://opendsax.cs.vt.edu/OpenDSA/Books/CS2/html/" target = "_blank" rel = "noopener noreferrer">Here</a> is 
                    a book instance that shows all of the exisiting modules, including ones that are not fully ready for classroom use.
                </li>
            </ul>

            <p>
                For instructors, we have support for making assignments and tracking your students' progress through the material. Materials 
                are created using the OpenDSA authoring and configuration tools.
            </p>

            <p>
                If you would like to contribute to our open-source project, please contact us: <a href="mailto:opendsa@cs.vt.edu">opendsa@cs.vt.edu</a>
            </p>

            {/*
            <p>
                OpenDSA materials are continuing to increase and improve. Already, our project includes:
            </p>

            <ul>
                <li>
                    Hundreds of instructional modules, where each module is the equivalent to one topic, such as one sorting algorithm, corresponding to a 
                    couple of pages in a standard textbook. Each module is of textbook quality. An "eTextbook" can be created from any collection of modules, 
                    as defined by an editable configuration file, making it easy for an instructor to create a custom textbook for a class.
                </li>
            </ul>
            */}
        </div>
    );
}

export default About;