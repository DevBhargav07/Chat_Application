import logging

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from typing_extensions import Annotated
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.models import User, Region, VisibilityLevel
from app.schemas import RegionOut, VisibilityUpdate, MyVisibilityOut, HealthResponse
from app.auth.permissions import IsAuthenticated

router = APIRouter(prefix="/chat", tags=["chat"])

session_dependency = Annotated[AsyncSession, Depends(get_async_session)]

logger = logging.getLogger(__name__)

@router.api_route("/health", methods=["GET", "HEAD"], response_model=HealthResponse)
async def health_check():
    return {"response": "ok"}

@router.get("/regions", response_model=List[RegionOut])
async def list_regions(session: session_dependency):
    result = await session.scalars(select(Region))
    return result.all()


@router.get("/me/visibility", response_model=MyVisibilityOut)
async def get_my_visibility(
    session: session_dependency,
    current_user: User = Depends(IsAuthenticated()),
):
    stmt = (
        select(User)
        .options(selectinload(User.regions))
        .where(User.id == current_user.id)
    )
    user = await session.scalar(stmt)
    return {
        "visibility": user.visibility.value,
        "regions": user.regions,
    }


@router.put("/me/visibility", response_model=MyVisibilityOut)
async def update_my_visibility(
    payload: VisibilityUpdate,
    session: session_dependency,
    current_user: User = Depends(IsAuthenticated()),
):
    if payload.visibility not in {v.value for v in VisibilityLevel}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid visibility value",
        )

    # validating regions
    regions = []
    if payload.visibility == "region":
        region_ids = set(payload.region_ids or [])
        if not region_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Select atleast one region"
            )

        regions = ( await session.scalars(
            select(Region).where(Region.id.in_(region_ids))
        )).all()
        if len(regions) != len(region_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more regions do not exist"
            )
        

    user = await session.scalar(
        select(User)
        .options(selectinload(User.regions))
        .where(User.id == current_user.id)
        .execution_options(populate_existing=True) # reload even if auth dependency already loaded this user.
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.visibility = VisibilityLevel(payload.visibility)
    user.regions = list(regions)

    try:
        await session.commit()
    except Exception:
        await session.rollback()
        logger.exception("update_my_visibility failed for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Could not update visibility"
        )

    await session.refresh(user, attribute_names=["visibility", "regions"])
    return {"visibility": user.visibility.value, "regions": user.regions}

    # if payload.visibility == "region":
    #     if not payload.region_ids:
    #         raise HTTPException(
    #             status_code=status.HTTP_400_BAD_REQUEST,
    #             detail="Select at least one region",
    #         )
    #     regions_stmt = select(Region).where(Region.id.in_(payload.region_ids))
    #     regions = (await session.scalars(regions_stmt)).all()
    #     user.regions = list(regions)
    # else:
    #     # switching to "everyone" or "nobody" clears any selected regions
    #     user.regions = []

    # await session.commit()
    # await session.refresh(user)

    # return {
    #     "visibility": user.visibility.value,
    #     "regions": user.regions,
    # }

