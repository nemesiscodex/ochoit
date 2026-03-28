import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotePicker } from "@/components/note-picker";

describe("note-picker", () => {
  it("renders a trigger button with the selected note", () => {
    render(
      <NotePicker
        selectedNote="C4"
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onSelectNote={() => {}}
      />,
    );

    const trigger = screen.getByLabelText("Test note picker");

    expect(trigger.textContent).toBe("C4");
  });

  it("disables the trigger when the disabled prop is true", () => {
    render(
      <NotePicker
        selectedNote="C4"
        disabled
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onSelectNote={() => {}}
      />,
    );

    const trigger = screen.getByLabelText("Test note picker");

    expect(trigger).toBeInstanceOf(HTMLButtonElement);
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the note grid when the trigger is clicked", () => {
    render(
      <NotePicker
        selectedNote="C4"
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onSelectNote={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Test note picker"));

    expect(screen.getByRole("dialog", { name: "Note picker" })).toBeTruthy();
    expect(screen.getByText("Select Note")).toBeTruthy();
  });

  it("calls onSelectNote and closes the grid when a note is clicked", () => {
    const onSelectNote = vi.fn();

    render(
      <NotePicker
        selectedNote="C4"
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onSelectNote={onSelectNote}
      />,
    );

    // Open picker
    fireEvent.click(screen.getByLabelText("Test note picker"));

    // Select D5
    fireEvent.click(screen.getByRole("button", { name: "Select note D5" }));

    expect(onSelectNote).toHaveBeenCalledWith("D5");

    // Grid should be closed
    expect(screen.queryByRole("dialog", { name: "Note picker" })).toBeNull();
  });

  it("renders seven rows for the base notes (C, D, E, F, G, A, B)", () => {
    render(
      <NotePicker
        selectedNote="C4"
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onSelectNote={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Test note picker"));

    const dialog = screen.getByRole("dialog", { name: "Note picker" });

    expect(dialog.textContent).toContain("C");
    expect(dialog.textContent).toContain("D");
    expect(dialog.textContent).toContain("E");
    expect(dialog.textContent).toContain("F");
    expect(dialog.textContent).toContain("G");
    expect(dialog.textContent).toContain("A");
    expect(dialog.textContent).toContain("B");
  });

  it("does not open when disabled", () => {
    render(
      <NotePicker
        selectedNote="C4"
        disabled
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onSelectNote={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Test note picker"));

    expect(screen.queryByRole("dialog", { name: "Note picker" })).toBeNull();
  });

  it("includes sharp notes for C, D, F, G, A but not for E and B", () => {
    render(
      <NotePicker
        selectedNote="C4"
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onSelectNote={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Test note picker"));

    // Sharps that should exist
    expect(screen.getByRole("button", { name: "Select note C#4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select note D#4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select note F#4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select note G#4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select note A#4" })).toBeTruthy();

    // E# and B# should NOT exist
    expect(screen.queryByRole("button", { name: "Select note E#4" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Select note B#4" })).toBeNull();
  });

  it("still previews hovered notes while the picker is open", () => {
    const onHoverNote = vi.fn();

    render(
      <NotePicker
        selectedNote="C4"
        accentColor="#ffcf4a"
        ariaLabel="Test note picker"
        onHoverNote={onHoverNote}
        onSelectNote={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText("Test note picker"));
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Select note D5" }));

    expect(onHoverNote).toHaveBeenCalledWith("D5");
  });
});
