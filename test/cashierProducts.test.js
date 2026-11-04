const assert = require("assert");
const express = require("express");
const path = require("path");
const exphbs = require("express-handlebars");
const env = require("./helpers/testEnv");
const { router } = require("../src/controllers/CashierController");

describe("Cashier product catalog", function () {
  this.timeout(15000);
  let server;
  let base;

  before(async function () {
    await env.connect();
    await Promise.all([
      env.Product.deleteMany({}),
      env.ProductSales.deleteMany({}),
      env.Team.deleteMany({})
    ]);

    const app = express();
    app.set("views", path.join(env.ROOT, "src", "views"));
    app.engine("hbs", exphbs.engine({
      extname: ".hbs",
      defaultLayout: false,
      helpers: { eqref: (left, right) => left === right }
    }));
    app.set("view engine", "hbs");
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use("/cashier", router);
    server = await new Promise(resolve => {
      const instance = app.listen(0, () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async function () {
    if (server) await new Promise(resolve => server.close(resolve));
    await Promise.all([
      env.Product.deleteMany({}),
      env.ProductSales.deleteMany({}),
      env.Team.deleteMany({})
    ]);
    await env.disconnect();
  });

  function post(path, body, json = false) {
    return fetch(base + path, {
      method: "POST",
      headers: {
        Cookie: env.adminCookie(),
        "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded"
      },
      redirect: "manual",
      body: json ? JSON.stringify(body) : new URLSearchParams(body)
    });
  }

  it("loads the default catalog into the management and cashier pages", async function () {
    const managementResponse = await fetch(base + "/cashier/products", {
      headers: { Cookie: env.adminCookie() }
    });
    assert.strictEqual(managementResponse.status, 200);
    const managementPage = await managementResponse.text();
    assert.match(managementPage, /Wasser/);
    assert.ok(managementPage.indexOf("🍺 Getränke") < managementPage.indexOf("🍴 Essen"));
    assert.ok(managementPage.indexOf("Wasser") < managementPage.indexOf("🍴 Essen"));
    assert.ok(managementPage.indexOf("Butterbrezel") > managementPage.indexOf("🍴 Essen"));
    assert.match(managementPage, /id="newProductSendToKitchen"/);
    assert.match(managementPage, /name="sendToKitchen"/);
    assert.match(managementPage, /<option value="yes"/);
    assert.match(managementPage, /<option value="no"/);

    const orderResponse = await fetch(base + "/cashier/order", {
      headers: { Cookie: env.adminCookie() }
    });
    assert.strictEqual(orderResponse.status, 200);
    const orderPage = await orderResponse.text();
    assert.match(orderPage, /Wasser/);
    assert.match(orderPage, /Grillfleischwecken/);
  });

  it("defaults kitchen routing to food and not drinks, including existing products", async function () {
    await env.Product.collection.insertOne({
      productId: "legacy-food",
      name: "Altes Essen",
      category: "food",
      price: 3,
      points: 0,
      active: true
    });

    await fetch(base + "/cashier/products", {
      headers: { Cookie: env.adminCookie() }
    });

    const food = await env.Product.findOne({ productId: "butterbrezel" }).lean();
    const drink = await env.Product.findOne({ productId: "wasser" }).lean();
    const legacyFood = await env.Product.findOne({ productId: "legacy-food" }).lean();
    assert.strictEqual(food.sendToKitchen, true);
    assert.strictEqual(drink.sendToKitchen, false);
    assert.strictEqual(legacyFood.sendToKitchen, true);
  });

  it("shows the live kitchen page only to cashiers and admins", async function () {
    const cashierResponse = await fetch(base + "/cashier/kitchen", {
      headers: { Cookie: env.adminCookie("cashier") }
    });
    assert.strictEqual(cashierResponse.status, 200);
    assert.match(await cashierResponse.text(), /Küchenbestellungen/);

    const unauthorizedResponse = await fetch(base + "/cashier/kitchen", {
      headers: { Cookie: env.adminCookie("TV") }
    });
    assert.strictEqual(unauthorizedResponse.status, 403);
  });

  it("creates and updates products with category, price, points and active state", async function () {
    const createResponse = await post("/cashier/products", {
      name: "Hausgemachte Limo",
      category: "drinks",
      price: "4.25",
      points: "5",
      active: "on",
      sendToKitchen: "yes"
    }, true);
    assert.strictEqual(createResponse.status, 302, await createResponse.text());

    const created = await env.Product.findOne({ name: "Hausgemachte Limo" });
    assert.ok(created);
    assert.strictEqual(created.category, "drinks");
    assert.strictEqual(created.price, 4.25);
    assert.strictEqual(created.points, 5);
    assert.strictEqual(created.active, true);
    assert.strictEqual(created.sendToKitchen, true);

    const updateResponse = await post("/cashier/products", {
      productId: created.productId,
      name: "Limo",
      category: "food",
      price: "4.50",
      points: "0",
      sendToKitchen: "no"
    }, true);
    assert.strictEqual(updateResponse.status, 302);

    const updated = await env.Product.findOne({ productId: created.productId });
    assert.strictEqual(updated.name, "Limo");
    assert.strictEqual(updated.category, "food");
    assert.strictEqual(updated.price, 4.5);
    assert.strictEqual(updated.active, false);
    assert.strictEqual(updated.sendToKitchen, false);
  });

  it("uses database prices and points when recording a sale and rejects inactive products", async function () {
    await fetch(base + "/cashier/products", { headers: { Cookie: env.adminCookie() } });
    const product = await env.Product.findOne({ productId: "weizen" });
    const team = await env.Team.create({ name: "Testteam", group: "A" });

    const foodProduct = await env.Product.findOne({ productId: "butterbrezel" });
    const saleResponse = await post("/cashier/update-beer", {
      teamId: String(team._id),
      items: [
        { id: product.productId, quantity: 2, price: 0, points: 0 },
        { id: foodProduct.productId, quantity: 1, price: 100, points: 100 }
      ]
    }, true);
    assert.strictEqual(saleResponse.status, 200);
    assert.strictEqual((await saleResponse.json()).success, true);

    const sale = await env.ProductSales.findOne({ productId: product.productId });
    assert.strictEqual(sale.totalQuantitySold, 2);
    assert.strictEqual(sale.totalRevenue, 7);
    const updatedTeam = await env.Team.findById(team._id);
    assert.strictEqual(updatedTeam.drinksCount.points, 6);
    assert.strictEqual(updatedTeam.drinksCount.weizen, 2);

    const kitchenResponse = await fetch(base + "/cashier/kitchen/orders", {
      headers: { Cookie: env.adminCookie() }
    });
    const kitchenData = await kitchenResponse.json();
    assert.strictEqual(kitchenData.orders.length, 1);
    const [kitchenOrder] = kitchenData.orders;
    assert.strictEqual(kitchenOrder.teamName, "Testteam");
    assert.ok(Number.isFinite(Date.parse(kitchenOrder.createdAt)));
    assert.deepStrictEqual(kitchenOrder.items, [{
      name: "Butterbrezel",
      category: "food",
      quantity: 1
    }]);

    const completeResponse = await post(`/cashier/kitchen/orders/${kitchenOrder.id}/complete`, {}, true);
    assert.strictEqual(completeResponse.status, 200);
    assert.strictEqual((await completeResponse.json()).success, true);
    const remainingOrders = await (await fetch(base + "/cashier/kitchen/orders", {
      headers: { Cookie: env.adminCookie() }
    })).json();
    assert.deepStrictEqual(remainingOrders.orders, []);

    product.active = false;
    await product.save();
    const rejectedResponse = await post("/cashier/update-beer", {
      teamId: String(team._id),
      items: [{ id: product.productId, quantity: 1 }]
    }, true);
    assert.strictEqual(rejectedResponse.status, 400);

    const deleteResponse = await post(`/cashier/products/${product.productId}/delete`, {}, true);
    assert.strictEqual(deleteResponse.status, 302);
    const deletedProduct = await env.Product.findOne({ productId: product.productId });
    assert.strictEqual(deletedProduct.deleted, true);
    assert.strictEqual(deletedProduct.active, false);
    assert.strictEqual((await env.ProductSales.findOne({ productId: product.productId })).totalQuantitySold, 2);

    const managementResponse = await fetch(base + "/cashier/products", {
      headers: { Cookie: env.adminCookie() }
    });
    assert.doesNotMatch(await managementResponse.text(), /Weizen \(0,5l\)/);

    const orderResponse = await fetch(base + "/cashier/order", {
      headers: { Cookie: env.adminCookie() }
    });
    assert.doesNotMatch(await orderResponse.text(), /Weizen \(0,5l\)/);
  });
});
