"""Seed script: Growth4U project with brands, niches, and competitors."""
import asyncio

from sqlalchemy import select

from app.database import async_session, engine, Base
from app.models.project import Project, Brand
from app.models.niche import Niche, NicheBrand


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        # Check if already seeded
        result = await session.execute(select(Project).where(Project.slug == "growth4u"))
        if result.scalar_one_or_none():
            print("Growth4U project already exists, skipping seed.")
            return

        # Create project
        project = Project(
            name="Growth4U",
            slug="growth4u",
            description="Growth consultancy for fintech — GEO visibility tracking",
            website="https://growth4u.io",
            market="es",
            language="es",
        )
        session.add(project)
        await session.flush()

        # Add brands (company_type pre-seeded; use /analyze endpoint for live extraction)
        brands_data = [
            {"name": "Growth4U", "domain": "growth4u.io", "is_client": True,
             "aliases": ["Growth 4 U", "Growth4u", "growth4u"],
             "company_type": "Agencia de growth marketing",
             "target_market": "Startups fintech y tecnología en España"},
            {"name": "Flake", "domain": "flake-agency.com", "is_client": False,
             "aliases": ["Flake Agency"],
             "company_type": "Agencia de growth marketing"},
            {"name": "Product Hackers", "domain": "producthackers.com", "is_client": False,
             "aliases": ["ProductHackers"],
             "company_type": "Agencia de growth hacking"},
            {"name": "Flat 101", "domain": "flat101.es", "is_client": False,
             "aliases": ["Flat101"],
             "company_type": "Agencia de marketing digital y analítica"},
            {"name": "ShareASale", "domain": "shareasale.com", "is_client": False,
             "aliases": [],
             "company_type": "Plataforma de marketing de afiliados"},
            {"name": "bloo.media", "domain": "bloo.media", "is_client": False,
             "aliases": ["BlooMedia"],
             "company_type": "Agencia de marketing digital"},
            {"name": "InboundCycle", "domain": "inboundcycle.com", "is_client": False,
             "aliases": ["Inbound Cycle"],
             "company_type": "Agencia de inbound marketing"},
            {"name": "MKS Agency", "domain": "mks.agency", "is_client": False,
             "aliases": [],
             "company_type": "Agencia de marketing digital"},
            {"name": "WeAreMarketing", "domain": "wearemarketing.com", "is_client": False,
             "aliases": ["We Are Marketing"],
             "company_type": "Agencia de marketing digital internacional"},
            {"name": "Vokse", "domain": "vokse.media", "is_client": False,
             "aliases": [],
             "company_type": "Agencia de growth y performance marketing"},
        ]

        brands = {}
        for brand_data in brands_data:
            brand = Brand(project_id=project.id, **brand_data)
            session.add(brand)
            await session.flush()
            brands[brand_data["name"]] = brand

        # Add niches with their competitors
        niches_data = [
            {
                "name": "Empresas Fintech",
                "slug": "empresas-fintech",
                "description": "Fintechs en fase de crecimiento que buscan escalar en España",
                "competitors": ["Flake", "Product Hackers", "Flat 101", "bloo.media", "InboundCycle"],
            },
            {
                "name": "Empresas de Tecnología",
                "slug": "empresas-tecnologia",
                "description": "Startups y empresas tech que necesitan growth marketing",
                "competitors": ["Product Hackers", "Flat 101", "WeAreMarketing", "MKS Agency", "Vokse"],
            },
        ]

        total_links = 0
        for sort_idx, niche_data in enumerate(niches_data):
            niche = Niche(
                project_id=project.id,
                name=niche_data["name"],
                slug=niche_data["slug"],
                description=niche_data["description"],
                sort_order=sort_idx,
            )
            session.add(niche)
            await session.flush()

            for comp_name in niche_data["competitors"]:
                if comp_name in brands:
                    nb = NicheBrand(niche_id=niche.id, brand_id=brands[comp_name].id)
                    session.add(nb)
                    total_links += 1

        await session.commit()
        print(f"Seeded Growth4U project with {len(brands_data)} brands, {len(niches_data)} niches, {total_links} niche-competitor links.")


if __name__ == "__main__":
    asyncio.run(seed())
