# Tournament-Planner

Welcome to Tournament-Planner - your comprehensive solution for managing the legendary "Semadenger Budeturnier"! This web application streamlines tournament organization and provides real-time updates for participants and spectators alike.

## 🌟 Features

### Tournament Management
- **Game Scheduling**
  - Flexible group phase planning
  - Automated playoff brackets
  - Easy-to-use interface for match management

### Real-Time Updates
- **Live Scoring System**
  - Instant goal count updates
  - Real-time standings
  - Live match status

### User Experience
- **Cross-Platform Accessibility**
  - Responsive design for all devices
  - Mobile-friendly interface
  - Seamless desktop experience

## 💻 Technical Overview

### Deployment
- Lightweight setup
- Flexible hosting options
- Minimal system requirements

### Architecture
- Modern web technologies
- Responsive design principles
- Real-time data synchronization

## 🔧 Installation

```bash
npm init
npm install
```
Install mongo DB Tools:
https://www.mongodb.com/docs/database-tools/installation/installation-windows/

## 🚀 Getting Started

The application can be started with various command line arguments to configure the server:

```bash
node index.js [arguments]
```

### Available Arguments:
- `--port <number>`: Sets the main application port (default: 3000 for HTTP, 443 for HTTPS)
- `--socket-port <number>`: Sets the WebSocket server port (default: 2053)
- `--https`: Enables HTTPS mode and uses budescharfeseck.de as hostname (default: HTTP with localhost)

uses MonoDB with Database "TournamentDB" and collections "games" "teams" "mainsettings"