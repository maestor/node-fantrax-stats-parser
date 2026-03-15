describe("type barrels", () => {
  test("load the root and shared type barrels without runtime exports", async () => {
    const rootTypes = await import("../types");
    const sharedTypes = await import("../shared/types");

    expect(rootTypes).toBeDefined();
    expect(sharedTypes).toBeDefined();
  });
});
