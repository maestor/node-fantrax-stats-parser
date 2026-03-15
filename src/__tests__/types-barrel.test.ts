describe("type barrels", () => {
  test("load the shared type barrel without runtime exports", async () => {
    const sharedTypes = await import("../shared/types");

    expect(sharedTypes).toBeDefined();
  });
});
