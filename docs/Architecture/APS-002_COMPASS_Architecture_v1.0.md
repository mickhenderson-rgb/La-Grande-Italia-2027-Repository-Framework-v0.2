# APS-002 – COMPASS Architecture

# Repository Structure

## core/
Application framework only.

- application.js
- bootstrap.js
- router.js
- repository.js
- repository-manager.js

## app/
Business features.

- dashboard.js
- planner.js
- day.js
- dayview.js
- planning-item.js
- accommodation.js
- data.js
- project.js
- layout.js
- render.js
- sidebar.js

Future:
activity.js
transport.js
restaurant.js
budget.js
journal.js

# Runtime

Bootstrap
→ Application
→ Router
→ Dashboard
→ Planner
→ Day
→ Feature

# Principles

- Core is stable.
- Features evolve.
- Repository is the source of truth.
- JSON stores facts.
- Calculations occur in code.
- Existing files evolve before creating new ones.

# Data

Project
 Journey
 Accommodation
 Activities
 Transport
 Restaurants
 Budget
 Journal
