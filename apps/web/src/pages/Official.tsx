import { Link } from "react-router-dom";

function Official() {
    return (
        <div>
            <h1>OpenDSA Official Documents</h1>
            
            <p>See our <Link to="/license">license</Link></p>

            <p>
                See our <a href="https://opendsa-server.cs.vt.edu/OpenDSA/lib/Privacy.html" target="_blank" rel="noopener noreferrer">Privacy Notice.</a>
            </p>

            <p>
                Higher Education Community Vendor Assessment Tool (HECVAT) forms are sometimes required by institutions in order to use 3rd-party software. 
                See our <a href="/documents/HECVAT3_OpenDSA_20220830.xlsx" download>HECVAT 3 Form.</a>
            </p>

            <p>
                Voluntary Product Accessibility Template forms are sometimes required by institutions in order to use 3rd-party software. We plan to post our 
                VPAT Form soon.
            </p>
        </div>
    );
}

export default Official;