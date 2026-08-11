import { describe, it, expect, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import { Columns } from "./Columns"

afterEach(cleanup)

const widths = () =>
  [...document.querySelectorAll("div.flex > div")].map((el) => el.className)

describe("Columns", () => {
  it("renders all three when all have content", () => {
    render(<Columns left={<p>L</p>} center={<p>C</p>} right={<p>R</p>} />)
    expect(widths()).toHaveLength(3)
  })

  it("drops the right column when it is null", () => {
    render(<Columns left={<p>L</p>} center={<p>C</p>} right={null} />)
    expect(widths()).toHaveLength(2)
    expect(screen.getByText("C")).toBeInTheDocument()
  })

  it("drops a column whose fragment is empty", () => {
    render(
      <Columns
        left={<p>L</p>}
        center={<p>C</p>}
        right={<>{null}{false}</>}
      />,
    )
    expect(widths()).toHaveLength(2)
  })

  it("keeps a column when its fragment has any child", () => {
    render(
      <Columns center={<p>C</p>} right={<>{null}<p>R</p></>} />,
    )
    expect(widths()).toHaveLength(2)
    expect(screen.getByText("R")).toBeInTheDocument()
  })

  it("renders centre alone when both sides are empty", () => {
    render(<Columns center={<p>C</p>} />)
    expect(widths()).toHaveLength(1)
  })
})
