"""
Session Manager for Creed Workflow
Provides session compaction and resumable state for long-running agent tasks.

Usage:
    from session_manager import SessionManager
    sm = SessionManager("content-gen", "build-ticket-123")
    
    # Check for interrupted session
    state = sm.load()
    if state:
        print(f"Resuming from: {state['last_step']}")
        print(f"What was done: {state['summary']}")
    
    # Save progress
    sm.save(
        last_step="building-twitter-auth",
        summary="Created Twitter OAuth wrapper, wrote tests. Next: build LinkedIn auth.",
        files_created=["src/auth/twitter.py", "src/auth/twitter.test.ts"],
        commit_hash=None,
        completed=False
    )
"""

import json
import os
from pathlib import Path
from datetime import datetime

WORKSPACE = Path("C:/home/node/.openclaw/workspace")
STATE_DIR = WORKSPACE / ".session-state"


def get_state_path(repo: str, task_id: str) -> Path:
    """Get path for a task's state file."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / f"{repo}_{task_id}.json"


class SessionState:
    """Represents a resumable session state."""

    def __init__(
        self,
        repo: str,
        task_id: str,
        last_step: str = "",
        summary: str = "",
        files_created: list[str] | None = None,
        files_modified: list[str] | None = None,
        commit_hash: str | None = None,
        completed: bool = False,
        steps: list[dict] | None = None,
        errors: list[str] | None = None,
        updated_at: str | None = None,
    ):
        self.repo = repo
        self.task_id = task_id
        self.last_step = last_step
        self.summary = summary
        self.files_created = files_created or []
        self.files_modified = files_modified or []
        self.commit_hash = commit_hash
        self.completed = completed
        self.steps = steps or []
        self.errors = errors or []
        self.updated_at = updated_at or datetime.now().isoformat()

    def to_dict(self) -> dict:
        return {
            "repo": self.repo,
            "task_id": self.task_id,
            "last_step": self.last_step,
            "summary": self.summary,
            "files_created": self.files_created,
            "files_modified": self.files_modified,
            "commit_hash": self.commit_hash,
            "completed": self.completed,
            "steps": self.steps,
            "errors": self.errors,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "SessionState":
        return cls(
            repo=d.get("repo", ""),
            task_id=d.get("task_id", ""),
            last_step=d.get("last_step", ""),
            summary=d.get("summary", ""),
            files_created=d.get("files_created", []),
            files_modified=d.get("files_modified", []),
            commit_hash=d.get("commit_hash"),
            completed=d.get("completed", False),
            steps=d.get("steps", []),
            errors=d.get("errors", []),
            updated_at=d.get("updated_at"),
        )


class SessionManager:
    """
    Manages session state persistence for Creed's long-running tasks.
    
    Call load() at the start of a task to check for interrupted state.
    Call save() after each major step to persist progress.
    Call complete() when done to clear the saved state.
    """

    def __init__(self, repo: str, task_id: str):
        self.repo = repo
        self.task_id = task_id
        self.path = get_state_path(repo, task_id)

    def load(self) -> SessionState | None:
        """Load saved state if it exists."""
        if not self.path.exists():
            return None
        
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Validate it's for the right repo/task
            if data.get("repo") != self.repo or data.get("task_id") != self.task_id:
                return None
            
            return SessionState.from_dict(data)
        except (json.JSONDecodeError, IOError):
            return None

    def save(self, **kwargs) -> None:
        """Save current session state."""
        # Load existing state if any
        existing = self.load()
        
        state = SessionState.from_dict(existing.to_dict()) if existing else SessionState(
            repo=self.repo, task_id=self.task_id
        )
        
        # Update with new values
        for key, value in kwargs.items():
            if hasattr(state, key):
                setattr(state, key, value)
        
        state.updated_at = datetime.now().isoformat()
        
        # Add a step log entry
        state.steps.append({
            "step": kwargs.get("last_step", state.last_step),
            "at": state.updated_at,
            "completed": kwargs.get("completed", False),
        })
        
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(state.to_dict(), f, indent=2)

    def complete(self) -> None:
        """Mark task complete and remove saved state."""
        if self.path.exists():
            self.path.unlink()

    def add_file_created(self, filepath: str) -> None:
        """Record a file that was created."""
        state = self.load() or SessionState(repo=self.repo, task_id=self.task_id)
        if filepath not in state.files_created:
            state.files_created.append(filepath)
            state.save(files_created=state.files_created)

    def add_error(self, error: str) -> None:
        """Record an error."""
        state = self.load() or SessionState(repo=self.repo, task_id=self.task_id)
        state.errors.append(error)
        state.save(errors=state.errors)

    def get_resume_prompt(self) -> str:
        """
        Generate the prompt to prepend when resuming an interrupted session.
        Use this as the first thing you say to the agent when resuming.
        """
        state = self.load()
        if not state:
            return ""
        
        lines = [
            f"## Resuming Interrupted Session",
            f"",
            f"**Task:** {state.task_id}",
            f"**Last completed step:** {state.last_step}",
            f"",
            f"**What was accomplished:**",
            f"{state.summary}",
            f"",
        ]
        
        if state.files_created:
            lines.append(f"**Files created:** {', '.join(state.files_created)}")
        
        if state.commit_hash:
            lines.append(f"**Last commit:** {state.commit_hash}")
        
        if state.errors:
            lines.append(f"**Errors encountered:** {'; '.join(state.errors)}")
        
        lines.extend([
            f"",
            f"Continue from where this left off. Do NOT repeat completed steps.",
            f"If the last step was committing or pushing, verify it actually happened before continuing.",
        ])
        
        return "\n".join(lines)


def resume_prompt(repo: str, task_id: str) -> str:
    """Quick helper to get resume prompt for a task."""
    sm = SessionManager(repo, task_id)
    return sm.get_resume_prompt()
