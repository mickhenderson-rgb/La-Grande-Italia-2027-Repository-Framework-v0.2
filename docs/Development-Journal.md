# La Grande Italia 2027

## The Henderson Grand Tour

**Repository Development Journal**

---

## Project Information

| Item        | Value                   |
| ----------- | ----------------------- |
| Project     | La Grande Italia 2027   |
| Version     | Repository 1.x          |
| Status      | Active Development      |
| Primary IDE | Visual Studio Code      |
| Browser     | Live Server             |
| Platform    | HTML / CSS / JavaScript |
| Data Format | JSON                    |

---

# Project Goal

Build a browser-based Travel Planning Operating System that:

- Works completely offline
- Is fully editable
- Uses JSON as the source of truth
- Can be converted into a Progressive Web App (PWA)
- Can generate a printable travel guide
- Can be updated as bookings change
- Can optimise routes, accommodation and transport over time

---

# Repository Structure

```
La-Grande-Italia-2027/

assets/
components/
core/
data/
docs/
logs/
pages/

index.html
README.html
```

---

# Development Principles

1. One responsibility per file.
2. No duplicated HTML.
3. JSON is the source of truth.
4. JavaScript reads data; it does not hard-code travel information.
5. Every repository update leaves the application in a working state.
6. Test after every commit.

---

# Repository Progress

| Version | Description                        | Status         |
| ------- | ---------------------------------- | -------------- |
| 0.1     | Repository framework               | ✅             |
| 0.2     | Core data model                    | ✅             |
| 0.3     | CSS framework                      | ✅             |
| 0.4     | JavaScript foundation              | ✅             |
| 0.5     | Navigation model                   | ✅             |
| 0.6     | Data expansion                     | ✅             |
| 0.7     | Application scripts                | ✅             |
| 0.8     | Navigation providers (Google/Waze) | ✅             |
| 0.9     | Component architecture             | ✅             |
| 1.0.1   | Shared components                  | ✅             |
| 1.0.2   | Template engine                    | ✅             |
| 1.0.3   | Stability fixes                    | ✅             |
| 1.0.4   | Application Core                   | ⏳ In Progress |

---

# Completed Milestones

- Repository created.
- JSON data model established.
- Route locked.
- Navigation data completed with coordinates.
- Google Maps support added.
- Waze support added.
- Live Server configured.
- First JavaScript runtime bug resolved.

---

# Known Issues

| ID    | Description                                              | Status  |
| ----- | -------------------------------------------------------- | ------- |
| K-001 | Migrate HTML fragments to JavaScript-rendered components | Planned |
| K-002 | Build Repository Manager                                 | Planned |
| K-003 | Build Data Manager                                       | Planned |
| K-004 | Build Destination Builder                                | Planned |

---

# Next Milestones

1. Complete Repository 1.0.4 (Application Core)
2. Repository 1.0.5 (Repository Manager)
3. Repository 1.0.6 (Component Manager)
4. Repository 1.0.7 (Data Manager)
5. Repository 1.0.8 (Navigation Manager)
6. Repository 1.0.9 (Developer Tools)
7. Repository 1.1.0 (Platform Complete)

---

# Testing Checklist

## Framework

- [ ] HTML loads
- [ ] CSS loads
- [ ] JavaScript loads
- [ ] Repository starts
- [ ] Components load
- [ ] Navigation loads
- [ ] JSON loads
- [ ] Theme switching works
- [ ] Search initialises
- [ ] No console errors

---

# Notes

Use this section to record decisions, changes, or ideas as the project evolves.

---

## Change Log

### Repository 1.0.4

**Objective**

Introduce the Application Core and central Repository object.

**Files**

- core/repository.js
- core/application.js
- core/bootstrap.js
- index.html

**Status**

In Progress

**Comments**

Bootstrap sequence being implemented.
