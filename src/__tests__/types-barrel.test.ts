describe("type barrels", () => {
  test("load the shared type barrel without runtime exports", async () => {
    const sharedTypes = jest.requireActual("../shared/types");

    expect(sharedTypes).toBeDefined();
  });
});
