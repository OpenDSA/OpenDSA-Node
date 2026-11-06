function AdminDashboard() {
    return (
        <div className="admin-dashboard">
            <h1>Administrator Dashboard</h1>
            <section>
                <h2>Recent Errors</h2>

                <table className="admin-table">
                    <thead>
                    <tr>
                        <th>Class Name</th>
                        <th>Message</th>
                        <th>URL</th>
                    </tr>
                    </thead>

                    <tbody>
                    <tr>
                        <td>book_config_parse_fail</td>
                        <td>Failed to parse CS5040Master.json</td>
                        <td></td>
                    </tr>
                    </tbody>
                </table>
                </section>
            <section>
                <h2>Current Term</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Starts On</th>
                            <th>Ends On</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Fall 2026</td>
                            <td>August 10, 2026</td>
                            <td>December 31, 2026</td>
                        </tr>
                    </tbody>
                </table>
            </section>
            <section>
                <h2>Course Offerings</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Course</th>
                            <th>Offering</th>
                            <th>Instructor</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>CS3114: Data Structures and Algorithms</td>
                            <td>Test</td>
                            <td>Gaurav Maharjan</td>
                        </tr>
                        <tr>
                            <td>CS 1114: Introduction to Software Design</td>
                            <td>public</td>
                            <td>Cliff Shaffer</td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    )
}

export default AdminDashboard; 