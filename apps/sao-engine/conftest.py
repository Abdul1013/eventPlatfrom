import os
import sys

# Ensure the sao-engine root is on sys.path so imports like
# `from models.schemas import ...` resolve correctly in all test files.
sys.path.insert(0, os.path.dirname(__file__))
