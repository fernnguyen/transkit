# Contributing to TransKit

Thank you for your interest in contributing to TransKit! We welcome contributions from everyone.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/fernnguyen/transkit.git
    cd transkit
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```

## Development Workflow

1.  **Create a branch** for your feature or fix:
    ```bash
    git checkout -b feature/my-new-feature
    ```
2.  **Make your changes**.
3.  **Lint and Format**:
    Ensure your code follows the project's style guidelines.
    ```bash
    npm run lint
    ```
4.  **Test your changes**:
    - Load the extension in Chrome (`chrome://extensions/`).
    - If already loaded, click the reload icon on the extension card.
    - Test the functionality on various websites.

## Code Style

We use **ESLint** and **Prettier** to maintain code quality and consistency.
- **ESLint**: Checks for potential errors and best practices.
- **Prettier**: Enforces a consistent code formatting style.

Running `npm run lint` will automatically fix most issues.

## Submitting a Pull Request

1.  **Push your branch** to your fork:
    ```bash
    git push origin feature/my-new-feature
    ```
2.  **Open a Pull Request** on the original repository.
3.  **Describe your changes**: Provide a clear description of what you did and why.
4.  **Wait for review**: We will review your PR and provide feedback.

## Reporting Issues

If you find a bug or have a feature request, please open an issue on GitHub. Be sure to include:
- Steps to reproduce the issue.
- Expected vs. actual behavior.
- Your browser version and OS.
