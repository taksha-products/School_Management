import { Router } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../../middleware/auth";
import { orgScope } from "../../middleware/orgScope";
import { isOrgAdminOrStaffAny } from "../../middleware/roleCheck";
import { Notification, type NotificationType } from "../../models/Notification";
import { asyncHandler } from "../../utils/asyncHandler";
import { getScopedOrganizationId } from "../../utils/orgFilter";

const orgNotificationsRouter = Router();

const guard = [auth, orgScope, isOrgAdminOrStaffAny("canManageStudents", "canViewReports")] as const;

const TYPES: NotificationType[] = [
  "general",
  "announcement",
  "fee",
  "bus",
  "marks",
  "other"
];

orgNotificationsRouter.get(
  "/",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const organizationId = getScopedOrganizationId(authReq, res)!;
    const rows = await Notification.find({ organizationId })
      .sort({ publishedAt: -1 })
      .limit(100)
      .lean();

    res.json({
      success: true,
      data: rows.map((row) => ({
        id: String(row._id),
        title: row.title,
        body: row.body,
        type: row.type,
        studentIds: (row.studentIds ?? []).map(String),
        publishedAt: row.publishedAt,
        isActive: row.isActive
      })),
      message: "Notifications fetched successfully"
    });
  })
);

orgNotificationsRouter.post(
  "/",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const organizationId = getScopedOrganizationId(authReq, res)!;
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    const typeRaw = typeof req.body?.type === "string" ? req.body.type : "general";
    const type = TYPES.includes(typeRaw as NotificationType)
      ? (typeRaw as NotificationType)
      : "general";
    const studentIdsRaw = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
    const studentIds = studentIdsRaw
      .filter((id: unknown): id is string => typeof id === "string" && Types.ObjectId.isValid(id))
      .map((id: string) => new Types.ObjectId(id));

    if (!title || !body) {
      res.status(400).json({
        success: false,
        data: null,
        message: "title and body are required"
      });
      return;
    }

    const created = await Notification.create({
      organizationId,
      title,
      body,
      type,
      studentIds,
      createdBy: new Types.ObjectId(authReq.user!.userId),
      publishedAt: new Date(),
      isActive: true
    });

    res.status(201).json({
      success: true,
      data: {
        id: String(created._id),
        title: created.title,
        body: created.body,
        type: created.type,
        studentIds: created.studentIds.map(String),
        publishedAt: created.publishedAt
      },
      message: "Notification created successfully"
    });
  })
);

export default orgNotificationsRouter;
