# Contributing to @brad/overturemaps

Thank you for your interest in contributing to this unofficial Overture Maps JavaScript client!

## Code of Conduct

Please be respectful and constructive in all interactions. We aim to foster an inclusive and welcoming community.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/overturemaps-js.git
   cd overturemaps-js
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Building

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Testing

```bash
npm test
```

Run tests in watch mode during development:
```bash
npm test -- --watch
```

### Linting

```bash
npm run lint
```

Fix auto-fixable linting issues:
```bash
npm run lint -- --fix
```

### Formatting

```bash
npm run format
```

## Project Structure

```
overturemaps-js/
├── src/              # Source TypeScript files
│   ├── index.ts      # Main entry point
│   ├── types.ts      # Type definitions
│   └── ...           # Additional modules
├── dist/             # Compiled JavaScript (generated)
├── SPEC.md           # Technical specification
├── TODO.md           # Implementation roadmap
└── README.md         # Project overview
```

## What to Work On

Check the [TODO.md](./TODO.md) file for a comprehensive list of tasks. Good first issues include:

- Implementing type validators
- Writing unit tests
- Adding documentation examples
- Improving error messages

## Coding Guidelines

### TypeScript

- Use TypeScript for all new code
- Provide type definitions for all public APIs
- Avoid `any` types when possible
- Use interfaces for object shapes

### Style

- Follow the existing code style
- Use Prettier for formatting (configured in `.prettierrc.json`)
- Use ESLint rules (to be configured)
- Write descriptive variable and function names

### Documentation

- Add JSDoc comments for public APIs
- Include usage examples in documentation
- Update README.md if adding new features
- Keep CHANGELOG.md up to date

### Testing

- Write unit tests for new functionality
- Aim for high code coverage
- Use descriptive test names
- Mock external dependencies

## Commit Messages

Write clear, concise commit messages:

```
feat: add bounding box validation

- Validate lat/lng ranges
- Add error messages for invalid boxes
- Include unit tests
```

Use conventional commit prefixes:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions or changes
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

## Pull Request Process

1. **Update documentation** if you've changed APIs
2. **Add tests** for new functionality
3. **Ensure all tests pass**: `npm test`
4. **Ensure linting passes**: `npm run lint`
5. **Update CHANGELOG.md** with your changes
6. **Submit a pull request** with a clear description of the changes

### Pull Request Checklist

- [ ] Code follows the project style guidelines
- [ ] Tests have been added/updated
- [ ] Documentation has been updated
- [ ] CHANGELOG.md has been updated
- [ ] All tests pass locally
- [ ] Linting passes
- [ ] Commit messages are clear and descriptive

## Questions or Issues?

- **Bug reports**: Open an issue with a clear description and steps to reproduce
- **Feature requests**: Open an issue describing the feature and use case
- **Questions**: Open a discussion or issue for clarification

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Acknowledgments

Thank you for helping make this project better! 🎉
