# OpenDSA-Node

OpenDSA-Node is a dockerized Node.js server for the OpenDSA eTextbook system. It uses LTI 1.3 (with support for LTI 1.1) to serve OpenDSA content to Learning Management Systems such as Canvas or Moodle. This repository uses the OpenDSA frontend content repository ([OpenDSA](https://github.com/OpenDSA/OpenDSA)).

OpenDSA-Node is intended to be a direct replacement for the two repositories that implement the Ruby/Rails version of the OpenDSA server: OpenDSA-LTI and OpenDSA-DevStack.

## Instructions

Clone repository, ensure docker is installed, run docker compose up --build

## Project Structure (WIP)

Built using Typescript, with Node and Express for the API layer and React and Vite for the course management web UI.
The Web UI React code and Express API layer are each in their own workspaces (web and backend, respectively). The React code is compiled by Vite and served by the Express backend.
The OpenDSA frontend repo will also be included at this level for the backend to draw from to compile books and serve precompiled html for the exercises.
A MySQL server image is started up by docker compose for development profiles, but will be hosted seperately in prod.

Plan to use LTIjs for lti 1.3 authentication management
Plan to use Passport.js for web app login authentication
Plan to use Prisma as an ORM
