"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { theme as themeTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import cuid from "cuid";
import { type ThemeStyles } from "@/types/theme";
import { auth } from "@/lib/auth";
import { headers } from "next/headers"; // Keep for session, but actions handle auth differently

// Helper to get user ID (Consider centralizing auth checks)
async function getCurrentUserId(): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: await headers(), // you need to pass the headers object.
  });
  return session?.user?.id ?? null;
}

// --- Zod Schemas (Consider moving to a shared types/schemas file) ---
const themeStylePropsSchema = z.object({
  background: z.string(),
  foreground: z.string(),
  card: z.string(),
  "card-foreground": z.string(),
  popover: z.string(),
  "popover-foreground": z.string(),
  primary: z.string(),
  "primary-foreground": z.string(),
  secondary: z.string(),
  "secondary-foreground": z.string(),
  muted: z.string(),
  "muted-foreground": z.string(),
  accent: z.string(),
  "accent-foreground": z.string(),
  destructive: z.string(),
  "destructive-foreground": z.string(),
  border: z.string(),
  input: z.string(),
  ring: z.string(),
  "chart-1": z.string(),
  "chart-2": z.string(),
  "chart-3": z.string(),
  "chart-4": z.string(),
  "chart-5": z.string(),
  sidebar: z.string(),
  "sidebar-foreground": z.string(),
  "sidebar-primary": z.string(),
  "sidebar-primary-foreground": z.string(),
  "sidebar-accent": z.string(),
  "sidebar-accent-foreground": z.string(),
  "sidebar-border": z.string(),
  "sidebar-ring": z.string(),
  "font-sans": z.string(),
  "font-serif": z.string(),
  "font-mono": z.string(),
  radius: z.string(),
  "shadow-color": z.string(),
  "shadow-opacity": z.string(),
  "shadow-blur": z.string(),
  "shadow-spread": z.string(),
  "shadow-offset-x": z.string(),
  "shadow-offset-y": z.string(),
  "letter-spacing": z.string(),
  spacing: z.string(),
});

const themeStylesSchema = z.object({
  light: themeStylePropsSchema,
  dark: themeStylePropsSchema,
});

const createThemeSchema = z.object({
  name: z.string().min(1, "Theme name cannot be empty"),
  styles: themeStylesSchema,
});

const updateThemeSchema = z.object({
  id: z.string(), // ID is needed to know which theme to update
  name: z.string().min(1, "Theme name cannot be empty").optional(),
  styles: themeStylesSchema.optional(),
});

// --- Server Actions ---

// Action to get user themes
export async function getThemes() {
  const userId = await getCurrentUserId();
  if (!userId) {
    // In actions, throwing errors is common for auth failures
    // Or return a specific structure like { success: false, error: "Unauthorized" }
    throw new Error("Unauthorized");
  }
  try {
    const userThemes = await db
      .select()
      .from(themeTable)
      .where(eq(themeTable.userId, userId));
    return userThemes;
  } catch (error) {
    console.error("Error fetching themes:", error);
    throw new Error("Failed to fetch themes."); // Propagate a generic error
  }
}

// Action to create a new theme
export async function createTheme(formData: {
  name: string;
  styles: ThemeStyles;
}) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const validation = createThemeSchema.safeParse(formData);
  if (!validation.success) {
    // Return validation errors for the client to handle
    return {
      success: false,
      error: "Invalid input",
      details: validation.error.format(),
    };
  }

  const { name, styles } = validation.data;
  const newThemeId = cuid();
  const now = new Date();

  try {
    const [insertedTheme] = await db
      .insert(themeTable)
      .values({
        id: newThemeId,
        userId: userId,
        name: name,
        styles: styles, // Already validated
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    revalidatePath("/"); // Or a more specific path where themes are displayed
    return {
      success: true,
      theme: insertedTheme,
    };
  } catch (error) {
    console.error("Error creating theme:", error);
    return { success: false, error: "Internal Server Error" };
  }
}

// Action to update an existing theme
export async function updateTheme(formData: {
  id: string;
  name?: string;
  styles?: ThemeStyles;
}) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const validation = updateThemeSchema.safeParse(formData);
  if (!validation.success) {
    return {
      success: false,
      error: "Invalid input",
      details: validation.error.format(),
    };
  }

  const { id: themeId, name, styles } = validation.data;

  if (!name && !styles) {
    return { success: false, error: "No update data provided" };
  }

  const updateData: Partial<typeof themeTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (name) updateData.name = name;
  if (styles) updateData.styles = styles; // Already validated

  try {
    const [updatedTheme] = await db
      .update(themeTable)
      .set(updateData)
      .where(and(eq(themeTable.id, themeId), eq(themeTable.userId, userId)))
      .returning();

    if (!updatedTheme) {
      return { success: false, error: "Theme not found or not owned by user" };
    }

    revalidatePath("/"); // Or a more specific path
    return {
      success: true,
      theme: updatedTheme,
    };
  } catch (error) {
    console.error(`Error updating theme ${themeId}:`, error);
    return { success: false, error: "Internal Server Error" };
  }
}

// Action to delete a theme
export async function deleteTheme(themeId: string) {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!themeId) {
    return { success: false, error: "Theme ID required" };
  }

  try {
    const [deletedInfo] = await db
      .delete(themeTable)
      .where(and(eq(themeTable.id, themeId), eq(themeTable.userId, userId)))
      .returning({ id: themeTable.id });

    if (!deletedInfo) {
      return { success: false, error: "Theme not found or not owned by user" };
    }

    revalidatePath("/"); // Or a more specific path
    return { success: true, deletedId: themeId };
  } catch (error) {
    console.error(`Error deleting theme ${themeId}:`, error);
    return { success: false, error: "Internal Server Error" };
  }
}
