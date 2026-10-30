import argparse
import contextlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

API_STDOUT = sys.stdout
BASE_DIR = Path(__file__).resolve().parent

sys.path.insert(0, str(BASE_DIR))

from services import battle_api


def _json_response(payload: dict[str, Any]) -> None:
    API_STDOUT.write(json.dumps(payload, ensure_ascii=False) + "\n")
    API_STDOUT.flush()


def _payload_from_text(text: str) -> dict[str, Any]:
    return json.loads(text) if text else {}


def call_core_probe() -> dict[str, Any]:
    from core.find_pets import pets_dataset

    final_forms = pets_dataset.filter_final_forms()
    return {
        "coreImportOk": True,
        "finalFormCount": len(final_forms),
        "firstFinalForm": final_forms[0].get("name", "") if final_forms else "",
    }


def persistent_worker(handlers: dict[str, Any]) -> int:
    """Serve repeated calculation requests over newline-delimited JSON."""
    for line in sys.stdin:
        timing: dict[str, float] = {}
        try:
            request = json.loads(line)
            command = request.get("command")
            if command not in {"trait-power-candidates", "calculate-quick-skills-batch"}:
                raise ValueError("Unsupported persistent Python command")
            battle_api.COMMAND_TIMING = {}
            with contextlib.redirect_stdout(sys.stderr):
                handler_started = time.perf_counter()
                payload = handlers[command](request.get("payload") or {})
                handler_ms = (time.perf_counter() - handler_started) * 1000
            timing = {"handler_ms": round(handler_ms, 2), **{key: round(value, 2) for key, value in battle_api.COMMAND_TIMING.items()}}
            _json_response({"ok": True, "data": payload, "timing": timing})
        except Exception as exc:
            timing = {"handler_ms": 0.0, **{key: round(value, 2) for key, value in battle_api.COMMAND_TIMING.items()}}
            _json_response({"ok": False, "error": str(exc), "timing": timing})
    return 0


def main() -> int:
    """Only core calculations cross the desktop's Python process boundary.

    Queries, persistence, OCR and sprite inference exist only in the shared Rust
    service. Trait runtime and the battle-engine probe stay with battle rules.
    """
    os.chdir(BASE_DIR)
    handlers = {
        "core-probe": lambda payload: call_core_probe(),
        "trait-info": battle_api.trait_info,
        "calculate-battle": battle_api.calculate_battle,
        "calculate-quick-skills": battle_api.calculate_quick_skills,
        "calculate-quick-skills-batch": battle_api.calculate_quick_skills_batch,
        "trait-power-candidates": battle_api.trait_power_candidates,
        "calculate-enemy-attack-skills": battle_api.calculate_enemy_attack_skills,
        "calculate-watch-advantages": battle_api.calculate_watch_advantages,
        "calculate-willpower": battle_api.calculate_willpower,
        "calculate-required-power": battle_api.calculate_required_power,
    }
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=[*handlers, "persistent-worker"])
    parser.add_argument("--payload", default="")
    parser.add_argument("--payload-stdin", action="store_true")
    args = parser.parse_args()
    if args.command == "persistent-worker":
        return persistent_worker(handlers)
    battle_api.COMMAND_TIMING = {}
    handler_ms = 0.0
    try:
        with contextlib.redirect_stdout(sys.stderr):
            payload_arg = _payload_from_text(sys.stdin.read() if args.payload_stdin else args.payload)
            handler_started = time.perf_counter()
            payload = handlers[args.command](payload_arg)
            handler_ms = (time.perf_counter() - handler_started) * 1000
        timing = None
        if args.command in {"trait-power-candidates", "calculate-quick-skills-batch"}:
            timing = {"handler_ms": round(handler_ms, 2), **{key: round(value, 2) for key, value in battle_api.COMMAND_TIMING.items()}}
        _json_response({"ok": True, "data": payload, "timing": timing})
        return 0
    except Exception as exc:
        timing = None
        if args.command in {"trait-power-candidates", "calculate-quick-skills-batch"}:
            timing = {"handler_ms": round(handler_ms, 2), **{key: round(value, 2) for key, value in battle_api.COMMAND_TIMING.items()}}
        _json_response({"ok": False, "error": str(exc), "timing": timing})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
