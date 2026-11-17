"""Field-level encryption for the identity vault (AES-256-GCM) and keyed lookup hashes.

Keys live in backend/keys/, separate from the database file, so a copied database alone is unreadable.
Each ciphertext is bound to its row through associated data, so it cannot be swapped onto another case.
"""
import hashlib
import hmac
import os
from functools import lru_cache

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import KEYS_DIR

KEY_ID = "vault-k1"


def _load_or_create(name: str) -> bytes:
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    path = KEYS_DIR / name
    if not path.exists():
        path.write_bytes(os.urandom(32))
    key = path.read_bytes()
    if len(key) != 32:
        raise RuntimeError(f"Key file {name} is corrupt (expected 32 bytes)")
    return key


@lru_cache(maxsize=1)
def _aead() -> AESGCM:
    return AESGCM(_load_or_create("vault.key"))


@lru_cache(maxsize=1)
def _lookup_key() -> bytes:
    return _load_or_create("lookup.key")


def encrypt(plaintext: bytes, aad: str) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    return nonce, _aead().encrypt(nonce, plaintext, aad.encode("utf-8"))


def decrypt(nonce: bytes, ciphertext: bytes, aad: str) -> bytes:
    return _aead().decrypt(nonce, ciphertext, aad.encode("utf-8"))


def encrypt_text(text: str, aad: str) -> tuple[bytes, bytes]:
    return encrypt(text.encode("utf-8"), aad)


def decrypt_text(nonce: bytes, ciphertext: bytes, aad: str) -> str:
    return decrypt(nonce, ciphertext, aad).decode("utf-8")


def lookup_hash(value: str) -> str:
    """Keyed hash for finding a record by a secret value (e.g. phone) without storing the value."""
    return hmac.new(_lookup_key(), value.encode("utf-8"), hashlib.sha256).hexdigest()
