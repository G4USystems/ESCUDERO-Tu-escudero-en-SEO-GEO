"""Run all seed scripts: create tables + Growth4U project + prompts."""
import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from app.seed.growth4u import seed as seed_growth4u
from app.seed.prompts_es import seed as seed_prompts


async def main():
    print("=== Seeding database ===")
    await seed_growth4u()
    await seed_prompts()
    print("=== Seed complete ===")


if __name__ == "__main__":
    asyncio.run(main())
