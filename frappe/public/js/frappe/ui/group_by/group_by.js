frappe.provide("frappe.views");

frappe.ui.GroupBy = class {
	constructor(report_view) {
		this.report_view = report_view;
		this.page = report_view.page;
		this.doctype = report_view.doctype;
		this.make();
	}

	make() {
		this.make_group_by_button();
		this.init_group_by_popover();
		this.set_popover_events();
	}

	init_group_by_popover() {
		this.sql_aggregate_functions = [
			{ name: "count", label: __("Count") },
			{ name: "sum", label: __("Sum") },
			{ name: "avg", label: __("Average") },
			{ name: "min", label: __("Minimum") },
			{ name: "max", label: __("Maximum") },
		];

		this.group_by_popover = $(frappe.render_template("group_by_area"));

		this.new_group_by_field = frappe.render_template("group_by", {
			group_by_conditions: this.get_group_by_fields(),
			parent_doctype: this.doctype,
		});

		this.new_aggregate_column_field = frappe.render_template("aggregate_column", {
			aggregate_function_conditions: this.sql_aggregate_functions,
		});

		this.group_by_popover.find(".group-by-fields.form-group").html(this.new_group_by_field);

		this.group_by_popover
			.find(".aggregate-fields.form-group")
			.html(this.new_aggregate_column_field);

		this.group_by_button.popover({
			content: this.group_by_popover,
			template: `
				<div class="group-by-popover popover">
					<div class="arrow"></div>
					<div class="popover-body popover-content">
					</div>
				</div>
			`,
			html: true,
			trigger: "manual",
			container: "body",
			placement: "bottom",
			offset: "-100px, 0",
		});
	}

	// TODO: make common with filter popover
	set_popover_events() {
		$(document.body).on("click", (e) => {
			if (this.wrapper && this.wrapper.is(":visible")) {
				if (
					$(e.target).parents(".group-by-popover").length === 0 &&
					$(e.target).parents(".group-by-box").length === 0 &&
					$(e.target).parents(".group-by-button").length === 0
				) {
					this.clear_empty_fields();
					this.wrapper && this.group_by_button.popover("hide");
				}
			}
		});

		this.group_by_button.on("click", () => {
			this.group_by_button.popover("toggle");
		});

		this.group_by_button.on("shown.bs.popover", () => {
			if (!this.wrapper) {
				this.wrapper = $(".group-by-popover");
				this.setup_group_by_area();
			}
			if (!this.group_by?.length) {
				this.add_group_by_field();
			}

			if (!this.group_by_aggregate_fields?.length) {
				this.add_aggregate_column_field();
			}
		});

		this.group_by_button.on("hidden.bs.popover", () => {
			this.update_group_by_button();
		});

		frappe.router.on("change", () => {
			this.clear_empty_fields();
			this.group_by_button.popover("hide");
		});
	}

	setup_group_by_area() {
		if (!this.group_by) {
			this.group_by = [];
		}

		if (!this.group_by_aggregate_fields) {
			this.group_by_aggregate_fields = [];
		}

		this.group_by_box = this.wrapper.find(".group-by-box");
		this.group_by_box.find(".group-by-fields").html("");
		this.group_by_box.find(".aggregate-fields").html("");

		this.group_by.forEach((data) => {
			this.add_group_by_field(data.group_by_doctype, data.group_by_field);
		});
		this.group_by_aggregate_fields.forEach((data) => {
			this.add_aggregate_column_field(
				data.aggregate_function,
				data.aggregate_on_doctype,
				data.aggregate_on_field
			);
		});

		this.set_group_by_events();
	}

	set_group_by_events() {
		// try running on change
		this.group_by_box.on("change", "select.group-by", () => {
			this.apply_group_by_and_refresh();
		});

		this.group_by_box.on("change", "select.aggregate-function", (e) => {
			this.toggle_aggregate_on_field_options($(e.target).closest(".aggregate-row"));
			this.apply_group_by_and_refresh();
		});

		this.group_by_box.on("change", "select.aggregate-on", () => {
			this.apply_group_by_and_refresh();
		});

		this.group_by_box.on("click", "button.add-group-by", (e) => {
			this.add_group_by_field();
		});

		this.group_by_box.on("click", "button.add-aggregate-column", (e) => {
			this.add_aggregate_column_field();
		});

		this.group_by_box.on("click", ".remove-group-by", (e) => {
			$(e.target).closest(".group-by-row").remove();
			this.apply_group_by_and_refresh();
			e.stopPropagation();
		});

		this.group_by_box.on("click", ".remove-aggregate-column", (e) => {
			$(e.target).closest(".aggregate-row").remove();
			this.apply_group_by_and_refresh();
			e.stopPropagation();
		});

		this.group_by_box.on("click", ".apply-group-by", (e) => {
			this.apply_group_by_and_refresh();
			this.clear_empty_fields();
			this.group_by_button.popover("hide");
		});

		this.group_by_box.on("click", ".remove-all-group-by", (e) => {
			this.remove_group_by();
			this.group_by_button.popover("hide");
		});
	}

	toggle_aggregate_on_field_options(aggregate_row) {
		if (!aggregate_row) {
			aggregate_row = this.group_by_box.find(".aggregate-row");
		}

		for (let idx = 0; idx < aggregate_row.length; idx++) {
			this.aggregate_on_select = $(aggregate_row[idx]).find("select.aggregate-on");
			this.aggregate_function_select = $(aggregate_row[idx]).find(
				"select.aggregate-function"
			);

			let fn = this.aggregate_function_select.val();
			let aggregate_on_html = `<option value="" disabled selected>
						${__("Select Field...")}
					</option>`;

			for (let doctype in this.all_fields) {
				const doctype_fields = this.all_fields[doctype];
				doctype_fields.forEach((field) => {
					// pick numeric fields for sum / avg / min / max
					if (
						!["sum", "avg", "min", "max"].includes(fn) ||
						frappe.model.is_numeric_field(field.fieldtype)
					) {
						let field_label = field.label || frappe.model.unscrub(field.fieldname);
						let option_text =
							doctype == this.doctype
								? __(field_label, null, field.parent)
								: `${__(field_label, null, field.parent)} (${__(doctype)})`;
						aggregate_on_html += `<option data-doctype="${doctype}"
									value="${field.fieldname}">${option_text}</option>`;
					}
				});
			}

			this.aggregate_on_select.html(aggregate_on_html);
		}
	}

	set_args(args) {
		if (this.group_by?.length) {
			if (!this.group_by_aggregate_fields) {
				this.group_by_aggregate_fields = [];
			}

			// save original fields
			if (!this.original_fields) {
				this.original_fields = this.report_view.fields.map((f) => f);
			}

			this.report_view.fields = [];

			this.group_by.forEach((data) => {
				let { group_by_doctype, group_by_field } = data;
				this.report_view.fields.push([group_by_field, group_by_doctype]);
			});

			let order_by_doctype = this.report_view.sort_selector.doctype;
			let order_by_field = this.report_view.sort_selector.sort_by;

			// this.report_view.fields = [[this.group_by_field, this.group_by_doctype]];
			let group_by_aggregate_fields_name = [];
			this.group_by_aggregate_fields.forEach((data) => {
				let { aggregate_on_doctype, aggregate_on_field, aggregate_function } = data;
				group_by_aggregate_fields_name.push(
					[aggregate_on_field, aggregate_on_doctype, aggregate_function].join(":")
				);

				// Report View Fields
				const fieldMatch = this.report_view.fields.find(
					(field) =>
						field[0] === aggregate_on_field &&
						field[1] === aggregate_on_doctype &&
						field[2] === aggregate_function
				);
				if (!fieldMatch) {
					this.report_view.fields.push([
						aggregate_on_field,
						aggregate_on_doctype,
						aggregate_function,
					]);
				}

				// Order By - replace with aggregate column
				if (
					order_by_doctype === aggregate_on_doctype &&
					order_by_field === aggregate_on_field
				) {
					args.order_by = args.order_by.replace(
						"`tab" + order_by_doctype + "`." + order_by_field,
						[aggregate_function, aggregate_on_doctype, aggregate_on_field].join(":")
					);
				}
			});

			this.report_view.fields = this.report_view.fields.reduce((fields, field) => {
				if (!field[2]) {
					fields.push(field);
				} else if (
					group_by_aggregate_fields_name.includes(Object.values(field).join(":"))
				) {
					fields.push(field);
				}
				return fields;
			}, []);

			// // rebuild fields for group by
			args.fields = this.get_fields();
			// setup columns in datatable
			this.report_view.setup_columns();

			Object.assign(args, {
				with_comment_count: false,
				aggregate_columns: this.group_by_aggregate_fields,
				group_by: this.group_by,
			});
		}
	}

	get_fields() {
		let fields = this.report_view.fields
			.map((f) => {
				if (f[2]) {
					return;
				}
				let column_name = frappe.model.get_full_column_name(f[0], f[1]);
				if (f[1] !== this.doctype) {
					// child table field or aggregate field
					column_name = column_name + " as " + `'${[...f].reverse().join(":")}'`;
				}
				return column_name;
			})
			.filter(Boolean);

		const cdt_name_fields = this.report_view
			.get_unique_cdt_in_view()
			.map(
				(cdt) => frappe.model.get_full_column_name("name", cdt) + " as " + `'${cdt}:name'`
			);
		fields = fields.concat(cdt_name_fields);

		return fields;
	}

	get_group_by_docfield(column) {
		// called from build_column
		let docfield = {
			read_only: 1,
		};
		let [fieldname, doctype, aggregate_function] = column;

		if (aggregate_function === "count") {
			let d = frappe.meta.docfield_map[doctype][fieldname];
			docfield = {
				fieldtype: "Int",
				label: __("Count of {0}", [__(d.label, null, doctype)]),
				parent: doctype,
				width: 200,
			};
		} else {
			// get properties of "aggregate_on", for example Net Total
			docfield = Object.assign({}, frappe.meta.docfield_map[doctype][fieldname]);

			docfield.label = __("{0} of {1}", [
				this.sql_aggregate_functions.find((r) => r.name === aggregate_function)?.label,
				__(docfield.label, null, docfield.parent),
			]);

			if (aggregate_function === "avg" && docfield.fieldtype == "Int") {
				docfield.fieldtype = "Float"; // average of ints can be a float
			}
		}

		docfield.fieldname = `${[...column].reverse().join(":")}`;
		return docfield;
	}

	prepare_group_by_fields() {
		this.group_by = []; // group by fields
		this.group_by_aggregate_fields = []; // aggregate fields

		const group_by_select_fields = this.group_by_box.find(".group-by-fields select.group-by");
		for (let idx = 0; idx < group_by_select_fields.length; idx++) {
			const group_by_select = $(group_by_select_fields[idx]);
			if (group_by_select.val()) {
				this.group_by.push({
					group_by_doctype: group_by_select.find(":selected").attr("data-doctype"),
					group_by_field: group_by_select.val(),
				});
			}
		}

		const aggregate_fields = this.group_by_box.find(".aggregate-fields .aggregate-row");
		for (let idx = 0; idx < aggregate_fields.length; idx++) {
			const aggregate_on_select = $(aggregate_fields[idx]).find("select.aggregate-on");
			const aggregate_function = $(aggregate_fields[idx])
				.find("select.aggregate-function")
				.val();

			if (aggregate_on_select.val() && aggregate_function) {
				this.group_by_aggregate_fields.push({
					aggregate_on_doctype: aggregate_on_select
						.find(":selected")
						.attr("data-doctype"),
					aggregate_on_field: aggregate_on_select.val(),
					aggregate_function: aggregate_function,
				});
			}
		}
	}

	apply_group_by_and_refresh() {
		this.prepare_group_by_fields();
		this.report_view.refresh();
	}

	clear_empty_fields() {
		if (!this.group_by?.length) {
			this.group_by_box.find(".aggregate-fields").html("");
			this.remove_group_by();
		} else {
			Array(...this.group_by_box.find(".group-by-fields .group-by-row")).forEach((ele) => {
				if (!$(ele).find("select.group-by").val()) {
					$(ele).remove();
				}
			});

			Array(...this.group_by_box.find(".aggregate-fields .aggregate-row")).forEach((ele) => {
				if (!$(ele).find("select.aggregate-on").val()) {
					$(ele).remove();
				}
			});
		}
	}

	get_group_by_fields() {
		this.group_by_fields = {};
		this.all_fields = {};

		let excluded_fields = ["_liked_by", "idx", "name"];
		const standard_fields = frappe.model.std_fields.filter(
			(df) => !excluded_fields.includes(df.fieldname)
		);

		const fields = this.report_view.meta.fields
			.concat(standard_fields)
			.filter((f) =>
				[
					"Select",
					"Link",
					"Data",
					"Int",
					"Check",
					"Dynamic Link",
					"Autocomplete",
					"Date",
				].includes(f.fieldtype)
			);
		this.group_by_fields[this.doctype] = fields.sort((a, b) =>
			__(cstr(a.label)).localeCompare(cstr(__(b.label)))
		);
		this.all_fields[this.doctype] = this.report_view.meta.fields;

		const standard_fields_filter = (df) =>
			!frappe.model.no_value_type.includes(df.fieldtype) && !df.report_hide;

		const table_fields = frappe.meta.get_table_fields(this.doctype).filter((df) => !df.hidden);

		table_fields.forEach((df) => {
			const cdt = df.options;
			const child_table_fields = frappe.meta
				.get_docfields(cdt)
				.filter(standard_fields_filter)
				.sort((a, b) => __(cstr(a.label)).localeCompare(__(cstr(b.label))));
			this.group_by_fields[cdt] = child_table_fields;
			this.all_fields[cdt] = child_table_fields;
		});

		return this.group_by_fields;
	}

	update_group_by_button() {
		const group_by_applied = Boolean(this.group_by?.length);
		const button_label = group_by_applied ? __("Grouped by Applied") : __("Add Group");

		this.group_by_button
			.toggleClass("btn-default", !group_by_applied)
			.toggleClass("btn-primary-light", group_by_applied);

		this.group_by_button.find(".group-by-icon").toggleClass("active", group_by_applied);

		this.group_by_button.find(".button-label").html(button_label);
		this.group_by_button.attr("title", `${this.group_by?.length || 0} Groups applied`);
	}

	get_settings() {
		if (this.group_by?.length) {
			return {
				group_by: this.group_by,
				aggregate_columns: this.group_by_aggregate_fields,
			};
		} else {
			return null;
		}
	}

	apply_settings(settings) {
		this.group_by = settings.group_by;
		this.group_by_aggregate_fields = settings.aggregate_columns;
		this.update_group_by_button();
	}

	add_group_by_field(doctype, fieldname) {
		const new_field = $(this.new_group_by_field);
		this.group_by_box.find(".group-by-fields").append(new_field);
		if (doctype && fieldname) {
			new_field.find("select.group-by").val(fieldname);
			new_field
				.find("select.group-by")
				.find(`option[data-doctype="${doctype}"][value="${fieldname}"]`)
				?.prop("selected", true);
		}
	}

	add_aggregate_column_field(func, doctype, fieldname) {
		const new_field = $(this.new_aggregate_column_field);
		this.group_by_box.find(".aggregate-fields").append(new_field);
		this.toggle_aggregate_on_field_options(new_field);
		if (func && doctype && fieldname) {
			new_field.find("select.aggregate-on").val(fieldname);
			new_field
				.find("select.aggregate-on")
				.find(`option[data-doctype="${doctype}"][value="${fieldname}"]`)
				?.prop("selected", true);
			new_field.find("select.aggregate-function").val(func);
		}
	}

	remove_group_by() {
		this.group_by = [];
		this.group_by_aggregate_fields = [];

		this.group_by_box.find(".group-by-fields").html("");
		this.group_by_box.find(".aggregate-fields").html("");

		// restore original fields
		if (this.original_fields) {
			this.report_view.fields = this.original_fields;
		} else {
			this.report_view.set_default_fields();
		}

		this.report_view.setup_columns();
		this.original_fields = null;
		this.report_view.refresh();
	}

	make_group_by_button() {
		this.page.wrapper.find(".sort-selector").before(
			$(`<div class="group-by-selector">
				<button class="btn btn-default btn-sm group-by-button ellipsis">
					<span class="group-by-icon button-icon">
						${frappe.utils.icon("es-line-folder-alt")}
					</span>
					<span class="button-label hidden-xs">
						${__("Add Group")}
					</span>
				</button>
			</div>`)
		);

		this.group_by_button = this.page.wrapper.find(".group-by-button");
	}
};
