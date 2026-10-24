import os
import threading
import time


def exit_when_parent_dies(parent_pid: int, interval: float = 1.0) -> None:
    """Exit this process soon after `parent_pid` disappears, so a crashed app never leaves an orphan."""

    def watch() -> None:
        while True:
            try:
                os.kill(parent_pid, 0)
            except ProcessLookupError:
                os._exit(0)
            except PermissionError:
                pass  # exists, owned by someone else
            time.sleep(interval)

    threading.Thread(target=watch, name="parent-watch", daemon=True).start()
