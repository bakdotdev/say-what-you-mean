import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { App } from "../App"

afterEach(cleanup)

describe("App", () => {
  it("shows Hide by default and switches to Reveal", () => {
    render(<App />)
    expect(screen.getByLabelText("Secret message")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: /reveal/i }))
    expect(
      screen.getByLabelText("Received carrier text"),
    ).toBeInTheDocument()
  })

  it("renders the honest limits panel", () => {
    render(<App />)
    expect(screen.getByText(/lab experiment/i)).toBeInTheDocument()
  })
})
