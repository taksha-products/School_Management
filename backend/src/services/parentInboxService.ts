import { Types } from "mongoose";

import { Notification } from "../models/Notification";
import { NotificationRead } from "../models/NotificationRead";
import { Organization } from "../models/Organization";
import { User } from "../models/User";

const toId = (value: Types.ObjectId | string): string => String(value);

/**
 * Notifications visible to a parent: org-wide (no studentIds) or targeting their children.
 */
export const listParentNotifications = async (input: {
  organizationId: string;
  userId: string;
  parentStudentIds: string[];
  limit?: number;
}): Promise<{
  items: Array<{
    id: string;
    title: string;
    body: string;
    type: string;
    publishedAt: string;
    read: boolean;
  }>;
  unreadCount: number;
}> => {
  const orgId = new Types.ObjectId(input.organizationId);
  const childObjectIds = input.parentStudentIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));

  const filter = {
    organizationId: orgId,
    isActive: true,
    $or: [
      { studentIds: { $size: 0 } },
      { studentIds: { $exists: false } },
      ...(childObjectIds.length > 0 ? [{ studentIds: { $in: childObjectIds } }] : [])
    ]
  };

  const notifications = await Notification.find(filter)
    .sort({ publishedAt: -1 })
    .limit(Math.min(input.limit ?? 50, 100))
    .lean();

  const reads = await NotificationRead.find({
    organizationId: orgId,
    userId: new Types.ObjectId(input.userId),
    notificationId: { $in: notifications.map((n) => n._id) }
  })
    .select("notificationId")
    .lean();

  const readSet = new Set(reads.map((r) => toId(r.notificationId)));

  const items = notifications.map((n) => {
    const published =
      n.publishedAt instanceof Date
        ? n.publishedAt
        : new Date((n as { createdAt?: Date }).createdAt ?? Date.now());
    return {
      id: toId(n._id),
      title: n.title,
      body: n.body,
      type: n.type,
      publishedAt: published.toISOString(),
      read: readSet.has(toId(n._id))
    };
  });

  return {
    items,
    unreadCount: items.filter((item) => !item.read).length
  };
};

export const markNotificationRead = async (input: {
  organizationId: string;
  userId: string;
  notificationId: string;
  parentStudentIds: string[];
}): Promise<boolean> => {
  if (!Types.ObjectId.isValid(input.notificationId)) {
    return false;
  }

  const orgId = new Types.ObjectId(input.organizationId);
  const notification = await Notification.findOne({
    _id: input.notificationId,
    organizationId: orgId,
    isActive: true
  }).lean();

  if (!notification) {
    return false;
  }

  const targeted = (notification.studentIds ?? []).map(toId);
  if (targeted.length > 0) {
    const owns = targeted.some((id) => input.parentStudentIds.includes(id));
    if (!owns) {
      return false;
    }
  }

  await NotificationRead.updateOne(
    {
      userId: new Types.ObjectId(input.userId),
      notificationId: notification._id
    },
    {
      $setOnInsert: {
        organizationId: orgId,
        userId: new Types.ObjectId(input.userId),
        notificationId: notification._id,
        readAt: new Date()
      }
    },
    { upsert: true }
  );

  return true;
};

export const markAllNotificationsRead = async (input: {
  organizationId: string;
  userId: string;
  parentStudentIds: string[];
}): Promise<number> => {
  const { items } = await listParentNotifications({
    ...input,
    limit: 100
  });
  const unread = items.filter((item) => !item.read);
  for (const item of unread) {
    await markNotificationRead({
      ...input,
      notificationId: item.id
    });
  }
  return unread.length;
};

export const getParentSupportInfo = async (organizationId: string) => {
  const org = await Organization.findById(organizationId)
    .select("name code address phone email")
    .lean();
  if (!org) {
    return null;
  }
  return {
    orgName: org.name,
    orgCode: org.code,
    address: org.address ?? null,
    phone: org.phone ?? null,
    email: org.email ?? null,
    helpText:
      "For fees, bus, or account questions, contact your school office using the details below."
  };
};

export const updateParentProfile = async (input: {
  userId: string;
  name?: string;
}): Promise<{ id: string; name: string; phone: string | null; email: string } | null> => {
  const user = await User.findById(input.userId);
  if (!user || user.role !== "parent") {
    return null;
  }
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new Error("Name must be between 2 and 80 characters");
    }
    user.name = trimmed;
    await user.save();
  }
  return {
    id: toId(user._id),
    name: user.name,
    phone: user.phone ?? null,
    email: user.email
  };
};
