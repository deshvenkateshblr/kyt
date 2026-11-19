# Copilot Instructions

## Project Guidelines
- For product code reviews, prioritize first-time user discovery and end-to-end feature usability across major product areas (virtual trips, passport, curated trips, sharing), not just narrow component or data issues.
- Treat the homepage as the primary onboarding explanation when it clearly differentiates Virtual Trip, Upcoming Trip, AI Curated Journeys, Passport, and Save/Open. 
- Do not flag intentional distinctions or separate user-driven workflows as defects: 
  - Virtual Trips returning-user detection can remain scoped to that feature. 
  - Public app-generated views need no privacy consent. 
  - The file Save/Open module is the primary portability workflow. 
  - Passport stamps must be explicitly user-driven rather than inferred from ending a trip.