import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Header from "@/components/header";

describe("header", () => {
  it("renders a GitHub link to the repository", () => {
    render(<Header />);

    const githubLink = screen.getByRole("link", { name: "Open GitHub repository" });

    expect(githubLink.getAttribute("href")).toBe("https://github.com/nemesiscodex/ochoit");
    expect(githubLink.getAttribute("target")).toBe("_blank");
    expect(githubLink.getAttribute("rel")).toBe("noreferrer");
  });
});
