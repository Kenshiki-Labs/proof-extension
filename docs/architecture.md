# Architecture

Pulse Observer uses a shared core with thin browser-specific adapters. Product logic belongs in `src/core`; Plasmo entrypoints wire browser runtime events into normalized core messages.
