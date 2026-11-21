---
inclusion: always
---

# Engineering standards

## 1. Core Philosophy

- **KISS:** Keep implementations simple and avoid over-engineering.
- **DRY:** Extract repeated logic into reusable functions, hooks, or middleware instead of duplicating code.
- **YAGNI:** Only build what is explicitly required now; do not add speculative abstractions.

## 2. SOLID & Architecture

- **Single Responsibility (SRP):** Keep React components focused strictly on UI rendering; move API calls and business logic into custom hooks or service modules. Keep Next.js route handlers (`withRoute()`) thin and delegate business/database logic to service modules in `src/server/<module>`.
- **Open/Closed & Dependency Inversion:** Depend on TypeScript interfaces/types and inject dependencies as function arguments rather than hardcoding tight coupling between modules. No DI container and no repository layer.
- **Interface Segregation:** Define small, focused TypeScript interfaces rather than bloated all-in-one types.
- **Separation of Concerns:** Strictly separate UI components, state management, API routes, validation, and database models.

## 3. Code Quality & Reliability

- **Fail Fast:** Validate all inputs (such as route handler request bodies/params and environment variables) immediately at the boundary with Zod, via `withRoute()` and `src/server/env.ts`, and throw/return clear errors early.
- **Type Safety:** Avoid `any` in TypeScript; explicitly type function parameters, API responses, and database schemas.
- **Boy Scout Rule:** Whenever editing existing code, clean up dead code, unclear variable names, or minor duplication in the touched file.
