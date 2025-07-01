# Middle Manager Workflow Analysis

This document analyzes the suitability of the project for functioning as a "Middle Manager" for AI-driven development tasks. The proposed workflow is as follows:

1.  A human operator (the "Superior") gives a task to the Middle Manager.
2.  The Middle Manager evaluates the problem and defines success metrics.
3.  The Middle Manager delegates the task to a Sub-Agent (e.g., a specific AI model like Claude or Gemini).
4.  The Sub-Agent completes the task.
5.  The Middle Manager reviews the work to confirm it meets the success metrics and reports back to the Superior.

## Project Suitability

The project is **highly suitable** for this workflow. Its architecture is explicitly designed for this kind of task orchestration.

### Mapping to Project Components:

- **The Middle Manager:** This role is fulfilled by the `packages/backend` service. It houses the core logic for API interactions, process management, and task routing.
- **The Sub-Agents:** These are the AI models, integrated via the `adapters` architecture (e.g., `adapters/claude-code`, `adapters/gemini-cli`). The system is designed to be model-agnostic, allowing for different sub-agents to be used for different tasks.
- **Task Delegation:** When a request is made to the backend API, the `lifecycle-manager.ts` and related services select the appropriate adapter and delegate the task, passing along the necessary context.
- **Task Completion:** The adapter communicates with the AI model. The model's output (e.g., code, commands, text) is streamed back to the backend.

## How It Works (Current State)

1.  A user, via the `frontend` or a CLI, submits a prompt or command.
2.  The request hits the `packages/backend` API.
3.  The backend, acting as the Middle Manager, parses the request. It uses its configuration to select an active AI model adapter (a Sub-Agent).
4.  It forwards the request to the chosen adapter (e.g., `gemini-cli`).
5.  The adapter translates the request into a format the underlying AI model understands and sends it.
6.  The AI model processes the request and returns the result (e.g., generated code).
7.  The adapter streams the result back to the backend.
8.  The backend forwards the result to the user's interface.

## Recommended Steps to Fully Realize the Vision

The current system provides the infrastructure for delegation and execution. The primary area for enhancement is in **automating the review and validation process** (Step 5).

Here are the recommended steps to get there:

### 1. Define Formal Success Metrics

For any given task, the "Middle Manager" needs a programmatic way to define success. This could be implemented by extending the API to accept success criteria along with the prompt.

**Examples:**

- **For bug fixes:** "The associated unit tests must pass."
- **For new features:** "The code must be accompanied by new passing unit tests."
- **For all code:** "The code must adhere to the project's linting rules (`eslint`) and pass type checks (`tsc`)."

### 2. Implement an Automated Review Pipeline

After a Sub-Agent returns its work (e.g., new code), the Middle Manager should trigger an automated review pipeline before marking the task as "complete."

**Implementation Steps:**

1.  **Create a temporary workspace:** The Sub-Agent's changes should be applied to a temporary, isolated version of the codebase.
2.  **Run Static Analysis:** Execute project-standard commands like `npm run lint` and `npm run type-check`. Capture the output.
3.  **Run Tests:** Execute the relevant test suite (e.g., `npm test`). Capture the results.
4.  **Analyze Results:** If any of the above steps fail, the review fails. The Middle Manager can then either:
    - Report the failure back to the human operator.
    - **(Advanced)** Create a new prompt that includes the original request plus the error messages, and re-delegate it to the Sub-Agent for a second attempt.

### 3. Enhance the Backend Logic

The `packages/backend` would need new services to manage this review pipeline:

- A `ValidationService` that can be configured with the success metrics for a task.
- Logic within the `lifecycle-manager.ts` to trigger this `ValidationService` upon task completion from the adapter.
- A mechanism to store the results of the validation and associate them with the original task.
